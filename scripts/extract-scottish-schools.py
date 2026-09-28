"""Extract public school fields only; run with Python and openpyxl installed.
Usage: python scripts/extract-scottish-schools.py source.xlsx output.json
"""
import json
import sys
import openpyxl
rows = list(openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)['Open Schools'].values)
headers = rows[5]
fields = ['Seed Code', 'School Name', 'Post Code', 'Special Department', 'Primary Department', 'Secondary Department', 'Pre-school Department']
if any(field not in headers for field in fields):
    raise ValueError('Scottish source headers changed')
data = [{field: row[headers.index(field)] for field in fields} for row in rows[6:] if isinstance(row[0], (int, float))]
with open(sys.argv[2], 'w', encoding='utf-8') as output:
    json.dump(data, output, ensure_ascii=False)
