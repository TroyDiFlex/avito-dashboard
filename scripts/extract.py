"""Read local XLSX snapshots without changing the source workbooks."""
import argparse, datetime, json, pathlib
import openpyxl

def extract(folder):
    books = []
    for path in sorted(pathlib.Path(folder).glob('*.xlsx')):
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheets = []
        for sheet in workbook:
            if sheet.title != 'Статистика' and not sheet.title.startswith('Детализация'):
                continue
            rows = []
            for row in sheet.values:
                values = [v.isoformat()[:10] if isinstance(v, (datetime.datetime, datetime.date)) else v for v in row]
                while values and values[-1] is None:
                    values.pop()
                rows.append(values)
            while rows and not rows[-1]:
                rows.pop()
            sheets.append({'name': sheet.title, 'rows': rows})
        books.append({'name': path.stem, 'sheets': sheets})
    return {'books': books, 'exportedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder')
    parser.add_argument('output')
    args = parser.parse_args()
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(extract(args.folder), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Extracted local source sheets.')
