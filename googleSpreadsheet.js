var Tabletop = require('tabletop');

/**
 * Test if Google key is valid
 *
 * @param {string} key - Key of the spreadsheet
 * @returns {boolean} Test result
 */
function isValidKey(key) {
  return (key.length === 44 && (true === /^[\d\w-]+$/.test(key)));
}

/**
 * Fetch spreafsheet from Google
 *
 * @param {string} key - Key of the spreadsheet
 * @param {object} callback - action to perform once fetch is complete
 */
function fetch(key, callback) {
  var spreadsheetKey = key.trim();
  if (false === isValidKey(spreadsheetKey)) {
    console.error('Invalid key: %s', spreadsheetKey);
    return false;
  }

  var options = {
    key: spreadsheetKey,
    callback: callback,
    simpleSheet: false,
    debug: false,
    parseNumbers: true
  };

  Tabletop.init(options);
}

module.exports = {
  fetch: fetch    
};

