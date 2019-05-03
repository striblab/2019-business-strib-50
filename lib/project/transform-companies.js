/**
 * Transform company data coming Data UI
 */

// Dependencies
const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');

// Main transform
module.exports = (input, options) => {
  let y = options.publishYear;

  // Key by year
  let parsed = _.map(input.objects, c => {
    c.employees = _.keyBy(c.employees, 'publishyear');
    c.finances = _.keyBy(c.finances, 'publishyear');
    return c;
  });

  // Standardize category
  parsed = _.map(parsed, p => {
    p.categoryid = p.category ? _.kebabCase(p.category) : 'other';
    return p;
  });

  // Filter by customrank
  parsed = _.filter(
    parsed,
    p => p.finances && p.finances[y] && p.finances[y].customrank
  );

  // Pull out ranks
  parsed = _.map(parsed, p => {
    _.each([y, y - 1], t => {
      p.ranks = p.ranks || {};
      p.ranks[t] =
        p.finances && p.finances[t] && p.finances[t].customrank
          ? parseInt(p.finances[t].customrank, 10)
          : undefined;
    });

    return p;
  });

  // Check for logo
  parsed = _.map(parsed, p => {
    p.hasLogo = fs.existsSync(path.join(options.logos, p.coid + '.png'));
    return p;
  });

  // remove any unneeded data
  parsed = _.map(parsed, p => {
    delete p.officers;
    return p;
  });

  // Sort by current rank
  parsed = _.sortBy(parsed, p => p.ranks[y]);

  // Limit 50
  parsed = _.take(parsed, 50);

  // Some aggreate stats
  let hasFounded = _.filter(parsed, 'founded');
  console.error(`Companies with founded data: ${hasFounded.length}`);
  console.error(
    `Average founded: ${_.sumBy(hasFounded, 'founded') / hasFounded.length}`
  );
  let hasIncorporated = _.filter(parsed, 'inc');
  console.error(`Companies with incorporated data: ${hasIncorporated.length}`);
  console.error(
    `Average incorporated: ${_.sumBy(hasIncorporated, 'inc') /
      hasIncorporated.length}`
  );

  return parsed;
};
