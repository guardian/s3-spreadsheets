var async = require('async');
var gSpreadsheet = require('./googleSpreadsheet');
var s3 = require('./s3');
var CronJob = require('cron').CronJob;
var config = require('./config.json');

/**
 * Handle the returned master spreadsheet data
 *
 * @param data {object} - Tabletop models of sheets in spreadsheet
 * @param tabletop {object} - An instance of tabletop
 */
function parseMastersheet(data, tabletop) {
  var spreadsheets = tabletop.sheets('data').all();
  async.map(spreadsheets, fetchSheet, parseSheets); 
}

/**
 * Parse all the spreadsheets
 *
 * @param err {null|string} - async error response
 * @param sheets {array} - All the spreadsheets listed in the master file
 */
function parseSheets(err, sheets) {
  if (err) return console.error(err);
  async.map(sheets, createUploadData, uploadSheets);
}

/**
 * Upload all spreadsheets to S3
 *
 * @param err {null|string} - aync error response
 * @param sheets {array} - Sheets to be uploaded to S3
 */
function uploadSheets(err, sheets) {
  if (err) return console.error(err);
  async.each(sheets, uploadSheet, function(err) {
    if (err) return console.error(err);
  });
}

/**
 * Upload single sheet to S3
 *
 * @param data {object} - spreadsheet to be uploaded to S3
 * @param data.filename {string} - Name of the file
 * @param data.json {string} - File contents as JSON string
 * @param data.cacheAge {string} - Cache age
 * @param callback {function} - Async callback on completion
 */
function uploadSheet(data, callback) {
  s3.put(data, callback);
}

/**
 * Prep data for uploading
 *
 * @param data {object} - Spreadsheet data
 * @param data.sheet {object} - Original spreadsheet data
 * @param data.sheet.name {string} - Spreadsheet name
 * @param data.sheet.cacheage {string} - Cache age
 * @param data.sheet.key {string} - Google spreadsheet key
 * @param data.tabletop {object} - Tabletop instance
 * @param callback {function} - Async callback on completion
 */
function createUploadData(data, callback) {
  var spreadsheetName = (data.sheet.name) ? data.sheet.name : 'undefined';
  var cacheAge = data.sheet.cacheage;
  var json = createJSON(data.tabletop, spreadsheetName);
  var uploadData = {
    json: json,
    filename: data.sheet.key + '.json',
    cacheAge: data.sheet.cacheage || '60',
    contentType: 'application/json'
  };

  callback(null, uploadData);
}

/**
 * Parse data into JSON format
 *
 * @param tabletop {object} - Tabletop instance
 * @param spreadsheetName {string} - Name of the spreadsheet
 * @returns {object} - Data for uploading containing JSON string
 */
function createJSON(tabletop, spreadsheetName) {
  var jsonContent = {
      sheets: {},
      updated: Date(),
      name: spreadsheetName
  };

  tabletop.model_names.forEach(function(modelName) {
      jsonContent.sheets[modelName] = tabletop.sheets(modelName).all();
  });

  var json = JSON.stringify(jsonContent);
  json = json.replace(/(\r\n|\n|\r)/gm, '');
  return json;
}

/**
 * Fetch a single sheet from Google
 *
 * @param sheet {object} - Sheet data
 * @param sheet.key {string} - Key of the Google spreadsheet
 * @param callback {function} - Async callback on completion
 */
function fetchSheet(sheet, callback) {
  gSpreadsheet.fetch(sheet.key, function(data, tabletop) {
    callback(null, {sheet: sheet, tabletop: tabletop});
  });
}


/**
 * Action to run on every cron tick
 */
function cronTickAction() {
    gSpreadsheet.fetch(config.masterKey, parseMastersheet);
}

// Start a schedualed fetch and upload of all spreadsheets
// Once every minute
var cronJob = new CronJob({
  cronTime: '00 * * * * *',
  onTick: cronTickAction,
  start: false
});

cronJob.start();
