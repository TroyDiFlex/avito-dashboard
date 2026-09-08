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
  // Request read-only access during the owner's first manual execution.
  sourceIds().forEach(function(id) { Sheets.Spreadsheets.get(id, { fields: 'properties.title' }); });
  console.log('Готово. Ключ SYNC_TOKEN находится в настройках проекта → Свойства скрипта.');
}

function doGet() { return output({ message: 'Подключение аналитики Авито. Данные доступны только авторизованному запросу дашборда.' }); }

function doPost(e) {
  try {
    var request = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expected || typeof request.token !== 'string' || !equalToken(request.token, expected)) return output({ error: 'Неверный ключ подключения.' });
    var books = sourceIds().map(function(id) {
      var spreadsheet = Sheets.Spreadsheets.get(id, {
        fields: 'properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))'
      });
      var selected = spreadsheet.sheets.filter(function(sheet) {
        var name = sheet.properties.title;
        return name === 'Статистика' || /^Детализация(?:\s|$)/i.test(name);
      });
      selected.forEach(function(sheet) {
        var grid = sheet.properties.gridProperties;
        if (grid.rowCount > 100000 || grid.columnCount > 300) {
          throw new Error('Размер листа требует проверки: ' + sheet.properties.title);
        }
      });
      var ranges = selected.map(function(sheet) {
        return "'" + sheet.properties.title.replace(/'/g, "''") + "'";
      });
      var values = Sheets.Spreadsheets.Values.batchGet(id, {
        ranges: ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER'
      }).valueRanges || [];
      var sheets = selected.map(function(sheet, index) {
        return { name: sheet.properties.title, rows: values[index] && values[index].values || [] };
      });
      return { name: spreadsheet.properties.title, sheets: sheets };
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
