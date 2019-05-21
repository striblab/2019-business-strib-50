/**
 * Output CSV of data for print
 */

// Dependencies
const _ = require('lodash');
const helpers = require('./company-helpers.js');

// Format number in millions
function millions(input) {
  if (input) {
    return (Math.round((input / 1000000) * 10) / 10).toLocaleString();
  }
}

// Processing function
module.exports = (data, publishYear) => {
  let y = publishYear;
  let rows = [];

  data.forEach(c => {
    let row = {
      rank: c.ranks[y],
      company: c.name,
      stockSymbol: c.stocksymbol,
      category: c.category,
      description: c.shortdesc
    };

    // Revenue
    row.revenue = helpers.getValue(c.finances, 'revenue', y);
    row.previousRevenue = helpers.getPreviousValue(c.finances, 'revenue', y);
    row.revenueChangePercent =
      ((row.revenue - row.previousRevenue) / row.previousRevenue) * 100;

    // Income
    row.income = helpers.getValue(c.finances, 'netincomebeforeextra', y);
    row.previousIncome = helpers.getPreviousValue(
      c.finances,
      'netincomebeforeextra',
      y
    );
    row.incomeChangePercent =
      ((row.income - row.previousIncome) / row.previousIncome) * 100;

    // Assets
    row.assets = helpers.getValue(c.finances, 'totalassets', y);
    row.previousAssets = helpers.getPreviousValue(c.finances, 'totalassets', y);
    row.assetsChangePercent =
      ((row.assets - row.previousAssets) / row.previousAssets) * 100;

    // Market cap
    row.marketcap = helpers.getValue(c.finances, 'marketcap', y);
    row.previousMarketcap = helpers.getPreviousValue(
      c.finances,
      'marketcap',
      y
    );
    row.marketcapChangePercent =
      ((row.marketcap - row.previousMarketcap) / row.previousMarketcap) * 100;

    // Employees
    // row.employees = helpers.getValue(c.employees, 'total', y);
    // row.previousEmployees = helpers.getValue(c.employees, 'total', y - 1);
    // row.employeesChangePercent =
    //   (row.employees - row.previousEmployees) / row.previousEmployees * 100;

    // Format
    row.revenue = millions(row.revenue);
    row.previousRevenue = millions(row.previousRevenue);
    row.revenueChangePercent = helpers.round(row.revenueChangePercent, 1);
    row.income = millions(row.income);
    row.previousIncome = millions(row.previousIncome);
    row.incomeChangePercent = helpers.round(row.incomeChangePercent, 1);
    row.assets = millions(row.assets);
    row.previousAssets = millions(row.previousAssets);
    row.assetsChangePercent = helpers.round(row.assetsChangePercent, 1);
    row.marketcap = millions(row.marketcap);
    row.previousMarketcap = millions(row.previousMarketcap);
    row.marketcapChangePercent = helpers.round(row.marketcapChangePercent, 1);

    // Footnotes
    row.footnotes = _.filter([
      c.footnotes,
      helpers.getValue(c.finances, 'footnotes', y)
    ]).join('  ');

    rows.push(row);
  });

  return rows;
};
