import type { RouteRecordRaw } from 'vue-router'

const Board = () => import('./views/BoardView.vue')
const Settings = () => import('./views/SettingsView.vue')

/** The Service module (phase 5, F3). The launcher shows its tile only where the server runs it (SERVICE_MODULE=on). */
export const serviceRoutes: RouteRecordRaw[] = [
  {
    path: '/service',
    name: 'service-home',
    component: () => import('./views/ServiceHomeView.vue'),
    meta: { code: 'V01', title: 'Service home', module: 'service', layout: 'module-home', mockup: 'SvcHome.html' },
  },
  {
    path: '/service/board',
    name: 'service-board',
    component: Board,
    meta: { code: 'V02', title: 'Planning Board', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'board', mockup: 'SvcBoard.html' },
  },
  {
    path: '/service/jobs',
    name: 'service-jobs',
    component: () => import('./views/JobsView.vue'),
    meta: { code: 'V03', title: 'Jobs', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'jobs', mockup: 'SvcJobs.html' },
  },
  {
    path: '/service/jobs/:id',
    name: 'service-job',
    component: () => import('./views/JobFormView.vue'),
    meta: {
      code: 'V04', title: 'Job', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'jobs', mockup: 'SvcJob.html',
      parent: { title: 'Jobs', to: '/service/jobs' },
    },
  },
  {
    path: '/service/stock',
    name: 'service-stock',
    component: () => import('./views/StockView.vue'),
    meta: { code: 'V09', title: 'Stock for Jobs', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'stock' },
  },
  {
    path: '/service/reminders',
    name: 'service-reminders',
    component: () => import('./views/RemindersView.vue'),
    meta: { code: 'V06', title: 'Reminders', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'reminders' },
  },
  {
    path: '/service/claims',
    name: 'service-claims',
    component: () => import('./views/ClaimsView.vue'),
    meta: { code: 'V07', title: 'Installer Claims', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'claims' },
  },
  {
    path: '/service/claims/:id',
    name: 'service-claim',
    component: () => import('./views/ClaimFormView.vue'),
    meta: { code: 'V08', title: 'Installer claim', module: 'service', layout: 'module', menuGroup: 'planning', menuItem: 'claims', parent: { title: 'Installer Claims', to: '/service/claims' } },
  },
  {
    path: '/service/settings',
    name: 'service-settings',
    component: Settings,
    meta: { code: 'V05', title: 'Slots and Stages', module: 'service', layout: 'module', menuGroup: 'setup', menuItem: 'settings', mockup: 'SvcSettings.html' },
  },
]
