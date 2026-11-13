// Domain commands may depend on several records. Compare the read revision at commit,
// rerun unrelated concurrent work against fresh state, and write only changed items.
const lists=['users','records','events','outbox'] as const;
type Bucket=typeof lists[number];
type DomainState=Record<string,any>;
type Saved={version:number,state:DomainState,legacy:Record<string,any>|null,prior:Map<string,string>};

export async function loadWorkspace(db:D1Database,owner:string,seed:()=>DomainState):Promise<Saved>{
  const header=db.prepare('SELECT version,payload FROM workspaces WHERE owner=?').bind(owner);
  const items=db.prepare('SELECT bucket,item_id,payload FROM workspace_items WHERE owner=? ORDER BY bucket,ordinal').bind(owner);
  let [head,parts]=await db.batch([header,items]);
  if(!head.results.length){
    await db.prepare('INSERT OR IGNORE INTO workspaces(owner,version,payload) VALUES(?,0,?)').bind(owner,JSON.stringify({state:seed(),requests:{}})).run();
    [head,parts]=await db.batch([header,items]);
  }
  const row=head.results[0] as {version:number,payload:string};
  const saved=JSON.parse(row.payload),prior=new Map<string,string>();
  if(saved.state)return {version:row.version,state:saved.state,legacy:saved.requests??{},prior};
  const state:DomainState={...saved.meta};
  for(const bucket of lists)state[bucket]=[];
  for(const raw of parts.results){
    const item=raw as {bucket:Bucket,item_id:string,payload:string};
    state[item.bucket].push(JSON.parse(item.payload));
    prior.set(item.bucket+'/'+item.item_id,item.payload);
  }
  return {version:row.version,state,legacy:null,prior};
}

export async function receipt(db:D1Database,owner:string,key:string){
  const row=await db.prepare('SELECT result FROM workspace_receipts WHERE owner=? AND operation=? AND expires>?').bind(owner,key,Date.now()).first<{result:string}>();
  return row?JSON.parse(row.result):null;
}

export async function commitWorkspace(db:D1Database,owner:string,saved:Saved,key:string,result:unknown){
  const meta={...saved.state};
  for(const bucket of lists)delete meta[bucket];
  // version is NOT NULL: a stale revision aborts the entire D1 batch.
  const writes=[db.prepare('UPDATE workspaces SET version=CASE WHEN version=? THEN version+1 ELSE NULL END,payload=? WHERE owner=?').bind(saved.version,JSON.stringify({meta}),owner)];
  for(const bucket of lists){
    for(const [order,item] of saved.state[bucket].entries()){
      const json=JSON.stringify(item);
      if(saved.prior.get(bucket+'/'+item.id)===json)continue;
      writes.push(db.prepare('INSERT INTO workspace_items(owner,bucket,item_id,ordinal,payload) VALUES(?,?,?,?,?) ON CONFLICT(owner,bucket,item_id) DO UPDATE SET payload=excluded.payload,ordinal=excluded.ordinal').bind(owner,bucket,item.id,order,json));
    }
  }
  const expires=Date.now()+7*86400000;
  writes.push(db.prepare('DELETE FROM workspace_receipts WHERE owner=? AND expires<=?').bind(owner,Date.now()));
  for(const [operation,value] of Object.entries({...saved.legacy,[key]:result})){
    writes.push(db.prepare('INSERT INTO workspace_receipts(owner,operation,result,expires) VALUES(?,?,?,?)').bind(owner,operation,JSON.stringify(value),expires));
  }
  try{await db.batch(writes);return true;}
  catch(err){
    const row=await db.prepare('SELECT version FROM workspaces WHERE owner=?').bind(owner).first<{version:number}>();
    if(row&&row.version!==saved.version)return false;
    throw err;
  }
}
