import type { Tour } from './types'

/**
 * The first-time tour, from the Handbook's "How every screen is laid out": the launcher, a module home, the menu
 * rail and its panel, the top bar and how lists work. It works on any company's data and for any role: parts a person
 * does not have (Approvals, a second branch, a list) are left out quietly.
 */
const onModuleScreen = { layout: 'module' } as const

export const WELCOME_TOUR: Tour = {
  id: 'welcome',
  title: 'Find your way around',
  summary: 'The launcher, the menu, the top bar and how lists work, on your own screens.',
  pages: 'any',
  minutes: 2,
  startAt: '/',
  steps: [
    {
      target: 'launcher:tiles',
      page: { path: '^/$' },
      title: 'Your modules',
      text: 'Each tile opens a module, such as Purchase, Sales or Core. A tile marked No access is not part of your role; ask your administrator if you need it.',
    },
    {
      target: 'launcher:tiles',
      page: { path: '^/$' },
      wait: { kind: 'page', to: { layout: 'module-home' } },
      title: 'Open a module',
      text: 'Click a tile you can open. The tour carries on inside the module.',
    },
    {
      target: 'home:main',
      page: { layout: 'module-home' },
      title: 'The module’s home',
      text: 'The home shows what needs you: counts of open work, what waits for your approval and, in Purchase and Sales, charts you choose yourself.',
      placement: 'top',
    },
    {
      target: 'home:switcher',
      page: { layout: 'module-home' },
      optional: true,
      title: 'Switch module',
      text: 'The chip next to the logo takes you to another module without going back to the start.',
    },
    {
      target: 'home:main',
      page: { layout: 'module-home' },
      wait: { kind: 'page', to: onModuleScreen },
      title: 'Open a page',
      text: 'Click any card, tile or link on the home to open one of the module’s pages.',
      placement: 'top',
    },
    {
      target: 'rail:groups',
      page: onModuleScreen,
      wait: { kind: 'hover' },
      title: 'The menu rail',
      text: 'One icon for each menu group. Point at an icon to see its name.',
      placement: 'right',
    },
    {
      target: 'menu-panel',
      page: onModuleScreen,
      optional: true,
      title: 'The pages of a group',
      text: 'The panel lists the pages of the open group. Click the group’s icon again to fold it away and get more room.',
      placement: 'right',
    },
    {
      target: 'rail:switcher',
      page: onModuleScreen,
      title: 'All modules',
      text: 'The top icon switches to another module or back to all modules.',
      placement: 'right',
    },
    {
      target: 'rail:footer',
      page: onModuleScreen,
      title: 'Home and Sign out',
      text: 'At the bottom of the rail: this module’s home, then Sign out.',
      placement: 'right',
    },
    {
      target: 'search',
      page: onModuleScreen,
      title: 'Search pages',
      text: 'Type the name of any screen, such as Invoice or Customers, and press Enter to jump straight there.',
    },
    {
      target: 'approvals',
      page: onModuleScreen,
      optional: true,
      title: 'Approvals',
      text: 'Requests waiting for you, with a count. Purchase and Sales have one inbox each.',
    },
    {
      target: 'branch',
      page: onModuleScreen,
      optional: true,
      title: 'Your branch',
      text: 'New documents carry the branch shown here. If you work in more than one, pick one branch to narrow every home, list and report, or All my branches.',
    },
    {
      target: 'account',
      page: onModuleScreen,
      title: 'You',
      text: 'Your name opens My account and Sign out. On the demo, it is also where you switch to another person.',
    },
    {
      target: 'crumbs',
      page: onModuleScreen,
      title: 'Where you are',
      text: 'The trail shows where this page sits. Click a part of it to go back up.',
    },
    {
      target: 'filters',
      page: onModuleScreen,
      optional: true,
      title: 'Filters',
      text: 'Filters sit in one row. They are kept in the address bar, so Back and Refresh keep your place.',
    },
    {
      target: 'status-tabs',
      page: onModuleScreen,
      optional: true,
      title: 'Status tabs',
      text: 'Each tab shows how many documents have that status. Click one to see only those.',
    },
    {
      target: 'list',
      page: onModuleScreen,
      optional: true,
      title: 'The list',
      text: 'The document number is a link: click it to open the document. Buttons on a document appear only when your role allows them.',
      placement: 'top',
    },
    {
      target: 'help',
      title: 'Help is always here',
      text: 'Tours for the page you are on, Tutorial mode and starting again are all under Help. Press ? at any time to open it.',
    },
  ],
}
