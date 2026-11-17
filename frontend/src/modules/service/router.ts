import type { RouteRecordRaw } from 'vue-router'

const Placeholder = () => import('./views/ServicePlaceholderView.vue')

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
    component: Placeholder,
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
    path: '/service/settings',
    name: 'service-settings',
    component: Placeholder,
    meta: { code: 'V05', title: 'Slots and Stages', module: 'service', layout: 'module', menuGroup: 'setup', menuItem: 'settings', mockup: 'SvcSettings.html' },
  },
]
