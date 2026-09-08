/** Standalone Apps Script. Reads source sheets only; no edit or timed triggers. */
function sourceIds() {
  var ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_IDS') || '[]');
  if (ids.length !== 2) throw new Error('Укажите два ID таблиц в свойстве SPREADSHEET_IDS.');
  return ids;
}

function initialize() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('SYNC_TOKEN')) {
    properties.setProperty('SYNC_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  }
  // Request read access during the owner's first manual execution.
  sourceIds().forEach(function(id) { SpreadsheetApp.openById(id).getName(); });
  console.log('Готово. Ключ SYNC_TOKEN находится в настройках проекта → Свойства скрипта.');
}

function doGet() { return output({ message: 'Подключение аналитики Авито. Данные доступны только авторизованному запросу дашборда.' }); }

function doPost(e) {
  try {
    var request = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expected || typeof request.token !== 'string' || !equalToken(request.token, expected)) return output({ error: 'Неверный ключ подключения.' });
    var books = sourceIds().map(function(id) {
      var spreadsheet = SpreadsheetApp.openById(id);
      var timezone = spreadsheet.getSpreadsheetTimeZone();
      var sheets = spreadsheet.getSheets().filter(function(sheet) {
        return sheet.getName() === 'Статистика' || /^Детализация(?:\s|$)/i.test(sheet.getName());
      }).map(function(sheet) {
        var lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn();
        if (lastRow > 100000 || lastColumn > 300) throw new Error('Размер листа требует проверки: ' + sheet.getName());
        var rows = lastRow && lastColumn ? sheet.getRange(1, 1, lastRow, lastColumn).getValues() : [];
        rows = rows.map(function(row) {
          var values = row.map(function(v) { return v instanceof Date ? Utilities.formatDate(v, timezone, 'yyyy-MM-dd') : v === '' ? null : v; });
          while (values.length && values[values.length - 1] === null) values.pop();
          return values;
        });
        while (rows.length && !rows[rows.length - 1].length) rows.pop();
        return { name: sheet.getName(), rows: rows };
      });
      return { name: spreadsheet.getName(), sheets: sheets };
    });
    return output({ books: books, exportedAt: new Date().toISOString() });
  } catch (error) { return output({ error: 'Не удалось прочитать таблицы: ' + error.message }); }
}

function equalToken(a, b) {
  var difference = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
