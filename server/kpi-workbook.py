"""Read and write the constrained KPI workbook format using the Python standard library."""
import base64
import csv
import io
import json
import posixpath
import re
import sys
import zipfile
from xml.etree import ElementTree as E

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
def root(tag, ns=NS):
    return E.Element(tag, xmlns=ns)
def node(parent, tag, **attrs):
    return E.SubElement(parent, tag, attrs)
def sheet(rows):
    ws = root('worksheet')
    data = node(ws, 'sheetData')
    for index, values in enumerate(rows, 1):
        row = node(data, 'row', r=str(index))
        for col, value in enumerate(values):
            if value is None: continue
            numeric=isinstance(value,(int,float)) and not isinstance(value,bool)
            cell=node(row,'c',r=chr(65+col)+str(index),t='n' if numeric else 'inlineStr')
            if numeric: node(cell,'v').text=str(value)
            else: node(node(cell,'is'),'t').text=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',str(value))[:32767]
    return ws
def build(req):
    headers, example, objectives = req.get('headers',[]), req.get('example',[]), req.get('objectives',[])
    book = root('workbook')
    sheets = node(book, 'sheets')
    relations = root('Relationships', PKG)
    types = root('Types', CT)
    node(types,'Default',Extension='rels',ContentType='application/vnd.openxmlformats-package.relationships+xml')
    node(types,'Default',Extension='xml',ContentType='application/xml')
    def override(path, kind):
        node(types,'Override',PartName='/'+path,ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.'+kind+'+xml')
    override('xl/workbook.xml','sheet.main')
    parts = {}
    for idx, (name, rows) in enumerate(req.get('sheets') or [
        ('KPIs',[headers]), ('Instructions',[['Enter data on the KPIs sheet. Keep the headers.'],['Example row (fictional). Copy and edit the values.'],headers,example,['Use staffId for a team file. Leave blank for the current draft.'],['Weights including existing KPIs must match policy and total 100.']]),
        ('Objectives', [['Objective ID','Approved objective']]+objectives)],1):
        path=f'xl/worksheets/sheet{idx}.xml'
        node(sheets,'sheet',name=name,sheetId=str(idx),**{'{'+REL+'}id':'rId'+str(idx)})
        node(relations,'Relationship',Id='rId'+str(idx),Type=REL+'/worksheet',Target='worksheets/sheet'+str(idx)+'.xml')
        ws=sheet(rows)
        if req.get('sheets'):
            views=E.Element('sheetViews')
            view=node(views,'sheetView',workbookViewId='0')
            node(view,'pane',ySplit='1',topLeftCell='A2',activePane='bottomLeft',state='frozen')
            ws.insert(0,views)
            cols=E.Element('cols')
            for col,label in enumerate(rows[0],1):
                node(cols,'col',min=str(col),max=str(col),width=str(max(17,len(label)+3)),customWidth='1')
            ws.insert(1,cols)
            node(ws,'autoFilter',ref='A1:'+chr(64+len(rows[0]))+str(len(rows)))
        elif idx==1:
            validations=node(ws,'dataValidations',count=str(2+bool(objectives)))
            choices={'perspective':'"Financial,Customer,Process,Learning"','direction':'"Higher is better,Lower is better,Approved milestone scale,Binary outcome"'}
            if objectives:
                choices['objective']='ApprovedObjectives'
                node(node(book,'definedNames'),'definedName',name='ApprovedObjectives').text="'Objectives'!$A$2:$A$"+str(len(objectives)+1)
            for field, formula in choices.items():
                col=chr(65+headers.index(field))
                node(node(validations,'dataValidation',type='list',allowBlank='1',showErrorMessage='1',sqref=col+'2:'+col+'2001'),'formula1').text=formula
        override(path,'worksheet')
        parts[path]=ws
    package=root('Relationships',PKG)
    node(package,'Relationship',Id='rId1',Type=REL+'/officeDocument',Target='xl/workbook.xml')
    parts.update({'[Content_Types].xml':types,'_rels/.rels':package,'xl/workbook.xml':book,'xl/_rels/workbook.xml.rels':relations})
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as archive:
        for path,xml in parts.items(): archive.writestr(path,E.tostring(xml,encoding='utf-8',xml_declaration=True))
    return base64.b64encode(stream.getvalue()).decode()
def parse(req):
    out=io.StringIO()
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(req['bytes'],validate=True))) as archive:
        entries=archive.infolist()
        if len(entries)>160 or sum(e.file_size for e in entries)>8_000_000: raise ValueError()
        def xml(path):
            data=archive.read(path)
            if b'<!' in data.upper() or b'\x00' in data: raise ValueError()
            return E.fromstring(data)
        book=xml('xl/workbook.xml')
        sheet=next(s for s in book.findall('.//{*}sheet') if s.get('name')=='KPIs')
        relid=sheet.get('{'+REL+'}id')
        target=next(r.get('Target') for r in xml('xl/_rels/workbook.xml.rels') if r.get('Id')==relid and not r.get('TargetMode'))
        path=posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
        if not path.startswith('xl/worksheets/'):raise ValueError()
        strings=[]
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings=[''.join(t.text or '' for t in si.iter('{'+NS+'}t')) for si in xml('xl/sharedStrings.xml')]
        writer=csv.writer(out)
        rows=[]
        for row in xml(path).findall('.//{*}sheetData/{*}row'):
            values={}
            for cell in row.findall('{*}c'):
                ref=re.fullmatch(r'([A-Z]{1,2})[0-9]+',cell.get('r',''))
                if not ref or cell.find('{*}f') is not None:raise ValueError()
                col=0
                for char in ref[1]:col=col*26+ord(char)-64
                if col>32:raise ValueError()
                v=cell.findtext('{*}v','')
                if cell.get('t')=='s':v=strings[int(v)]
                if cell.get('t')=='inlineStr':v=''.join(t.text or '' for t in cell.iter('{'+NS+'}t'))
                if v:values[col]=v
            if values:rows.append(values)
            if len(rows)>2001:raise ValueError()
        width=max(rows[0])
        for row in rows:
            if max(row)>width:raise ValueError()
            writer.writerow([row.get(i,'') for i in range(1,width+1)])
    return out.getvalue()
try:
    req=json.load(sys.stdin)
    print(json.dumps(build(req) if req['op'] in ['build','report'] else parse(req)))
except Exception:
    sys.exit(2)
