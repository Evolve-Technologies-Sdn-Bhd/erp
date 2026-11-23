import type { Tour } from '@/tours/types'

/**
 * Guided tours for Service (installation jobs), from the field-sales handbook journeys: the job that a released order
 * makes (B), the Planning Board (D), recording the visit (E) and service reminders (F). Offered only where the Service
 * module runs. Booking, recording, closing and making jobs stay the person's own clicks.
 */

const JOBS: Tour = {
  id: 'service.jobs',
  title: 'Service home and jobs',
  summary: 'Where installation jobs come from, what waits to be booked, and every job by stage.',
  module: 'service',
  pages: ['V01', 'V03'],
  permission: 'service.view',
  requires: ['service'],
  minutes: 2,
  startAt: '/service',
  steps: [
    {
      target: 'home:kpis',
      page: { code: 'V01' },
      title: 'Today at a glance',
      text: 'Jobs today, what is not booked yet, what is overdue, service due this month, and jobs done but not closed. Click a card for the list behind it.',
    },
    {
      target: 'svc:waiting',
      page: { code: 'V01' },
      title: 'Waiting to be booked',
      text: 'A released sales order with installation adds a job here by itself, with the customer’s address, the items and the date they asked for. Nobody retypes it. Book opens the Planning Board with the job picked.',
      placement: 'right',
    },
    {
      target: 'svc:by-person',
      page: { code: 'V01' },
      title: 'Today by person',
      text: 'Each installer and technician, with their jobs for today.',
      placement: 'left',
    },
    {
      target: 'home:tiles',
      page: { code: 'V01' },
      wait: { kind: 'page', to: { code: 'V03' } },
      title: 'Open the jobs',
      text: 'Click the Jobs tile.',
    },
    {
      target: 'status-tabs',
      page: { code: 'V03' },
      title: 'Every job, by stage',
      text: 'Not booked, booked, done, closed or cancelled. The office also adds service, warranty and repair jobs here with New job.',
    },
    {
      target: 'list',
      page: { code: 'V03' },
      title: 'One job',
      text: 'Click a job number to open it: the customer and site, the items, the order it came from, its booking and what the installer recorded.',
      why: 'The site type (landed house, condo, shop) decides who may go there.',
      placement: 'top',
    },
  ],
}

const BOARD: Tour = {
  id: 'service.board',
  title: 'Book on the Planning Board',
  summary: 'Pick a job, see who suits it, and where the free slots are. Booking stays your click.',
  module: 'service',
  pages: ['V02'],
  permission: 'service.job.book',
  requires: ['service'],
  minutes: 2,
  startAt: '/service/board',
  steps: [
    {
      target: 'svc:day',
      page: { code: 'V02' },
      title: 'One day at a time',
      text: 'Move a day back or forward. Each row is a person, with their booked jobs coloured by type.',
    },
    {
      target: 'svc:not-booked',
      page: { code: 'V02' },
      optional: true,
      wait: { kind: 'appear', selector: '[data-tour="svc:pick"]' },
      waiting: 'Waiting for you to pick a job.',
      title: 'Pick a job',
      text: 'Click a job waiting to be booked. A star means the customer asked for this day.',
      placement: 'right',
    },
    {
      target: 'svc:pick',
      page: { code: 'V02' },
      optional: true,
      title: 'The slot group',
      text: "Only the groups for this job's type and kind of site are listed, and the job type's usual one is picked first. Pick another when the job needs longer or shorter slots. A yellow note here says what the job still lacks; you can book anyway.",
      placement: 'right',
    },
    {
      target: 'svc:people',
      page: { code: 'V02' },
      title: 'Who can take it',
      text: 'Free slots show on the people who take this kind of job and go to this kind of site. Someone greyed out says why. Clicking a free slot books it: the tour leaves that to you.',
      why: 'Two jobs for one person can never overlap.',
      placement: 'left',
    },
    {
      page: { code: 'V02' },
      title: 'After booking',
      text: 'The job is booked with an expected finish. If it runs late, Extend the time on the job, with a reason. A booked job past its expected finish, with no visit recorded, is overdue until the visit is recorded.',
    },
  ],
}

const VISIT: Tour = {
  id: 'service.visit',
  title: 'Record the visit',
  summary: 'What the installer did, photos, and paid on site. Recording and closing stay your clicks.',
  module: 'service',
  pages: ['V03', 'V04'],
  permission: 'service.job.record',
  requires: ['service'],
  minutes: 2,
  startAt: '/service/jobs?status=booked',
  steps: [
    {
      target: 'list',
      page: { code: 'V03' },
      wait: { kind: 'page', to: { code: 'V04', path: '^/service/jobs/(?!new$)' } },
      title: 'Open a booked job',
      text: 'Click the number of a booked job.',
      placement: 'top',
    },
    {
      target: 'svc:booking',
      page: { code: 'V04' },
      optional: true,
      title: 'The booking',
      text: 'Who goes, the day and slot, and when it is expected done. Extend the time if the job runs late.',
      placement: 'left',
    },
    {
      target: 'svc:photos',
      page: { code: 'V04' },
      optional: true,
      title: 'Photos from the visit',
      text: 'Add at least one photo of the finished work with + Add photo. Uploading attaches it to the job, so the tour leaves it to you.',
    },
    {
      target: 'action:record-visit',
      page: { code: 'V04' },
      optional: true,
      title: 'Record the visit',
      text: 'Complete, partly done or postponed; whether the customer paid on site; and what was done. The tour does not record it for you.',
      why: 'Paid on site is a note for the office. Payments themselves are official receipts on the sales order.',
    },
    {
      page: { code: 'V04' },
      title: 'After the visit',
      text: 'Complete: the job is done, and items with a service interval start a reminder. Partly done adds a follow-up job. Postponed goes back to not booked. Close the job when nothing is left to do.',
    },
  ],
}

const REMINDERS: Tour = {
  id: 'service.reminders',
  title: 'Service reminders',
  summary: 'Filter changes and other services that come due after an installation.',
  module: 'service',
  pages: ['V06'],
  permission: 'service.view',
  requires: ['service'],
  minutes: 1,
  startAt: '/service/reminders',
  steps: [
    {
      target: 'status-tabs',
      page: { code: 'V06' },
      title: 'Upcoming, job made, dismissed',
      text: 'A completed installation starts a reminder for each item with a service interval, due that many months later. Overdue ones show in red.',
    },
    {
      target: 'list',
      page: { code: 'V06' },
      title: 'Each reminder',
      text: 'The item, the customer, the job it came from and when it is due. 14 days before, a service job is made for the office to book.',
      placement: 'top',
    },
    {
      target: 'action:make-jobs',
      page: { code: 'V06' },
      title: 'Make jobs now',
      text: 'Makes the service jobs that are due within 14 days straight away, instead of waiting for the hourly run. It is safe to click twice; the tour leaves it to you.',
    },
  ],
}

export const SERVICE_TOURS: Tour[] = [JOBS, BOARD, VISIT, REMINDERS]
