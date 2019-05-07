/**
 * Main JS file for project.
 */

/**
 * Define globals that are added through the js.globals in
 * the config.json file, here, mostly so linting won't get triggered
 * and its a good queue of what is available:
 */
// /* global $, _ */

// Dependencies
import utils from './shared/utils.js';
import Content from '../templates/_index-content.svelte.html';

utils.documentReady(async () => {
  // Mark page with note about development or staging
  utils.environmentNoting();

  // Deal with share place holder (remove the elements, then re-attach
  // them in the app component)
  const attachShare = utils.detachAndAttachElement('.share-placeholder');

  // Get companies
  let companies = await (await window.fetch(
    //'./assets/data/companies.json'
    '//static.startribune.com/news/projects/all/2019-business-strib-50/assets/data/companies.json'
  )).json();

  // Main component
  const app = new Content({
    target: document.querySelector('.article-lcd-body-content'),
    hydrate: true,
    data: {
      companies,
      attachShare
    }
  });
});
