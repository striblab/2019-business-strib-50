/**
 * Import data from Google Spreadsheet to DB
 */

// Dependencies
const path = require('path');
const _ = require('lodash');
const Sequelize = require('sequelize');
const moment = require('moment');
const readlineSync = require('readline-sync');
const Sheets = require('../google-sheets.js');
const argv = require('yargs').argv;
const debug = require('debug')('import-companies');
require('dotenv').load();

// Run main
main();

// Main function
async function main() {
  validate();
  let db = await dbConnection();
  let input = await getSpreadsheetData();
  let current = await currentData(db);
  let previous = argv.previous
    ? require(path.resolve(argv.previous))
    : undefined;

  // Start transaction
  let transaction = await db.transaction();
  try {
    await importRows(db, input, current, previous, transaction);
  }
  catch (e) {
    console.error(e);
    await transaction.rollback();
    await db.close();
    console.error('Error importing data, changes not committed.');
    return;
  }

  // End transcation
  if (argv.commit) {
    let sure = readlineSync.question(
      'Are you sure you want to commit these changes? (y/n) '
    );
    if (sure && sure.trim().toLowerCase() === 'y') {
      console.error('Committing data.');
      await transaction.commit();
    }
    else {
      console.error('Rolling back.');
      await transaction.rollback();
    }
  }
  else {
    console.error('Rolling back, use the --commit option to commit data.');
    await transaction.rollback();
  }

  // Disconnect
  await db.close();
}

// Main import of data
async function importRows(db, input, current, previous, transaction) {
  for (let row of input) {
    await importRow(db, row, current, previous, transaction);
  }
}

// Import rown
async function importRow(db, row, current, previous, transaction) {
  const publishYear = parseInt(argv.publishYear, 10);
  const defaultFiscalYearEnd = new Date(`${publishYear - 1}-12-31`);

  // Create more standard symbol
  row.simpleSymbol = row.Symbol.split('.')[0];

  // Look up
  if (!row.COID) {
    let f = _.find(current.companies, { StockSymbol: row.simpleSymbol });
    if (f) {
      row.COID = f.COID;
    }
  }

  if (!row.COID) {
    throw new Error(
      `Unable to find a COID for symbol: ${row.Symbol} | ${row.Name}`
    );
  }

  // Output
  let output = `Import ${row.COID} | ${row.Rank} | ${row.Name}`;

  // Employees
  if (row['Employees']) {
    let employeesLookup = _.find(current.employees, e => {
      return (
        e.COID === row.COID && e.PublishYear && e.PublishYear === publishYear
      );
    });
    let employees = {
      COID: row.COID,
      Added: new Date(),
      PublishYear: publishYear,
      Total: parseNumber(row['Employees']),
      Footnotes: row['Employee footnotes'].trim() || null
    };
    if (employeesLookup) {
      employees.ID = employeesLookup.ID;
      employees.Added = employeesLookup.Added
        ? employeesLookup.Added
        : employees.Added;
    }

    // Import employees
    await upsert(db, 'Employees', employees, !!employeesLookup, transaction);
    output += ` | ${employeesLookup ? '[U]' : '[I]'} Employees`;
  }

  // Finances
  let financesLookup = _.find(current.finances, e => {
    return e.COID === row.COID && e.PublishYear === publishYear;
  });
  let finances = {
    ID: null,
    COID: row.COID,
    PublishYear: publishYear,
    CustomRank: parseNumber(row['Rank']),
    FYE: parseDate(row['Period']) || defaultFiscalYearEnd,
    MaxOfFYE: parseDate(row['Period']) || defaultFiscalYearEnd,
    //Source: 'Import from spreadsheet',
    Revenue: parseNumber(
      row[`Total Revenue FY${publishYear - 1}`],
      'float',
      1000000
    ),
    PrevYearRevenue: parseNumber(
      row[`Total Revenue FY${publishYear - 2}`],
      undefined,
      1000000
    ),
    NetIncome: parseNumber(
      row[`Net Income FY${publishYear - 1}`],
      'float',
      1000000
    ),
    PrevYearNetIncome: parseNumber(
      row[`Net Income FY${publishYear - 2}`],
      undefined,
      1000000
    ),
    TotalAssets: parseNumber(
      row[`Total Assets FY${publishYear - 1}`],
      'float',
      1000000
    ),
    PrevYearTotalAssets: parseNumber(
      row[`Total Assets FY${publishYear - 2}`],
      undefined,
      1000000
    ),
    MarketCap: parseNumber(
      row[`Total Market Capitalization FY${publishYear - 1}`],
      undefined,
      1000000
    ),
    PrevYearMarketCap: parseNumber(
      row[`Total Market Capitalization FY${publishYear - 2}`],
      undefined,
      1000000
    ),
    NetIncomeBeforeExtra: parseNumber(
      row[`Net Income Before Extraordinary Items FY${publishYear - 1}`],
      'float',
      1000000
    ),
    PrevYearNetIncomeBE: parseNumber(
      row[`Net Income Before Extraordinary Items FY${publishYear - 2}`],
      'float',
      1000000
    ),
    Footnotes: row.Footnotes
      ? row.Footnotes
      : financesLookup && financesLookup.Footnotes
        ? financesLookup.Footnotes
        : undefined
  };
  if (financesLookup) {
    finances.ID = financesLookup.ID;
  }

  // Import Finances
  await upsert(db, 'Finances', finances, !!financesLookup, transaction);
  output += ` | ${financesLookup ? '[U]' : '[I]'} Finances`;

  // Checkout last year
  if (previous) {
    let previousLookup = previous[row.COID.toString()];
    if (previousLookup) {
      let previousFinancesLookup = _.find(current.finances, e => {
        return e.COID === row.COID && e.PublishYear === publishYear - 1;
      });
      let previousFinances = {
        ID: null,
        COID: row.COID,
        PublishYear: publishYear - 1,
        CustomRank: previousLookup
      };
      if (previousFinancesLookup) {
        previousFinances.ID = previousFinancesLookup.ID;
      }

      // Import previous finances
      await upsert(
        db,
        'Finances',
        previousFinances,
        !!previousFinancesLookup,
        transaction
      );
      output += ` | ${
        previousFinancesLookup ? '[U]' : '[I]'
      } Previous finances`;
    }
  }

  // Output some info
  console.error(output);
}

// Run an upsert command
async function upsert(db, table, data, isUpdate, transaction, idField = 'ID') {
  // Modified data
  data.modified_date = data.modified_date || new Date();
  if (!isUpdate) {
    data.created_date = new Date();
  }

  if (!transaction) {
    throw new Error('Transaction not provided to upsert method.');
  }

  // Create query
  let query = `INSERT INTO ${table} (${_.map(data, (v, k) => k).join(
    ', '
  )}) VALUES (${_.map(data, () => '?').join(
    ', '
  )}) ON DUPLICATE KEY UPDATE ${_.map(data, (v, k) => {
    return k + ' = ?';
  }).join(', ')}`;

  // Run query
  await db.query(query, {
    type: db.QueryTypes.UPSERT,
    replacements: _.map(data).concat(_.map(data)),
    transaction
  });

  // Get new record, a littl ehacky
  let lastId = data[idField];
  if (!isUpdate) {
    lastId = await db.query('SELECT LAST_INSERT_ID() AS last', {
      transaction
    });
    lastId = lastId[0].last;
  }
  return (await db.query(`SELECT * FROM ${table} WHERE ${idField} = ?`, {
    type: db.QueryTypes.SELECT,
    replacements: [lastId],
    transaction
  }))[0];
}

// Check inputs and environment variable
function validate() {
  if (!argv.sheet) {
    throw new Error('--sheet argument not given.');
  }

  if (!argv.publishYear) {
    throw new Error('--publish-year argument not given.');
  }

  if (!process.env.BUSINESS_DB_URI) {
    throw new Error(
      'Environment variable BUSINESS_DB_URI not set.  Can use the .env file to set it.'
    );
  }

  if (argv.previous) {
    try {
      require(path.resolve(argv.previous));
    }
    catch (e) {
      console.error(e);
      throw new Error(
        `Using --previous argument; unable to load previous ranks file: ${
          argv.previous
        }`
      );
    }
  }
}

// Get db connection
async function dbConnection() {
  let db = new Sequelize(process.env.BUSINESS_DB_URI, { logging: debug });
  await db.authenticate();
  return db;
}

// Get spreadsheet data
async function getSpreadsheetData() {
  let sheets = new Sheets({
    noAuth: argv.sheet.match(/^http/i) ? true : false
  });
  return await sheets.getStructuredContents(argv.sheet);
}

// Get current data
async function currentData(db) {
  let data = {};
  data.companies = await db.query('SELECT * FROM Companies', {
    type: db.QueryTypes.SELECT
  });
  data.officers = await db.query('SELECT * FROM Officers', {
    type: db.QueryTypes.SELECT
  });
  data.salaries = await db.query('SELECT * FROM Officer_Salaries', {
    type: db.QueryTypes.SELECT
  });
  data.finances = await db.query('SELECT * FROM Finances', {
    type: db.QueryTypes.SELECT
  });
  data.employees = await db.query('SELECT * FROM Employees', {
    type: db.QueryTypes.SELECT
  });
  return data;
}

// Parse number
function parseNumber(input, type = 'int', multiplier = 1) {
  if (_.isNumber(input)) {
    return input;
  }
  else if (!_.isString(input)) {
    return undefined;
  }

  input = input.replace(/[^0-9-.]/g, '').trim();
  let parsed = type === 'int' ? parseInt(input, 10) : parseFloat(input);
  return _.isNaN(parsed) ? undefined : parsed * multiplier;
}

// Parse date
function parseDate(input) {
  if (_.isDate(input)) {
    return input;
  }

  if (!_.isString(input)) {
    return undefined;
  }

  let m = moment(input, 'MM/DD/YYYY');
  if (m.isValid()) {
    return m.toDate();
  }
}
