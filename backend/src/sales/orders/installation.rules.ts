import type { FieldError } from '../../platform/http/errors';
import { dayText } from '../shared/package-lines.rules';

/**
 * The installation option on a sales order (phase 5, F1 part 5), asked only when the company turns on "Ask for an
 * installation option on the order" (S34). It follows the agent's signing step of the Sales Mobile App Handbook:
 * the installation date is needed when every item is in stock; when some are short, installation is arranged when
 * stock arrives. The date is the customer's preferred date (decision 10): the office books the installer and the
 * slot. Pure functions, tested in installation.rules.spec.ts.
 */

export const INSTALL_OPTIONS = ['INSTALLATION', 'DELIVERY', 'COLLECT'] as const;
export type InstallOption = (typeof INSTALL_OPTIONS)[number];
export const INSTALL_OPTION_LABEL: Record<InstallOption, string> = { INSTALLATION: 'Installation', DELIVERY: 'Delivery only', COLLECT: 'Collect' };
export const DEFAULT_INSTALL_OPTION: InstallOption = 'INSTALLATION';

export const INSTALL_DATE_REQUIRED = 'Pick the customer\'s preferred installation date. It is needed when every item is in stock.';

/**
 * What the order keeps. With the switch off nothing is asked and nothing is kept. With it on, the option defaults to
 * Installation, and only an installation keeps a date.
 */
export function installationFields(
  asked: boolean,
  input: { option?: string | null; date?: string | null },
  current: { option: string | null; date: string | null } | null = null,
): { installOption: InstallOption | null; installDate: string | null } {
  if (!asked) return { installOption: null, installDate: null };
  const option = (input.option ?? current?.option ?? DEFAULT_INSTALL_OPTION) as InstallOption;
  const date = input.date !== undefined ? input.date : (current?.date ?? null);
  return { installOption: option, installDate: option === 'INSTALLATION' ? date || null : null };
}

/**
 * The postcode and state of the delivery address, asked with the installation option so the office has the whole
 * install address before booking. With the switch off nothing is kept. Left out on a save, they stay as they were;
 * empty clears them.
 */
export function deliveryAreaFields(
  asked: boolean,
  input: { postcode?: string | null; state?: string | null },
  current: { postcode: string | null; state: string | null } | null = null,
): { deliveryPostcode: string | null; deliveryState: string | null } {
  if (!asked) return { deliveryPostcode: null, deliveryState: null };
  const pick = (v: string | null | undefined, was: string | null) => (v === undefined ? was : v?.trim() || null);
  return { deliveryPostcode: pick(input.postcode, current?.postcode ?? null), deliveryState: pick(input.state, current?.state ?? null) };
}

/** The preferred date cannot be before the order date. */
export function installationErrors(f: { installOption: InstallOption | null; installDate: string | null }, docDate: string): FieldError[] {
  if (f.installOption === 'INSTALLATION' && f.installDate && f.installDate < docDate) {
    return [{ field: 'installDate', message: `The preferred date cannot be before the order date (${dayText(docDate)}).` }];
  }
  return [];
}

/**
 * At release: an installation needs its date when every item is in stock. Items short of stock or bought to order
 * mean installation waits for stock, and then no date is needed now.
 */
export function releaseInstallation(f: { installOption: string | null; installDate: string | null }, allInStock: boolean): { refusal: string | null; afterStock: boolean } {
  if (f.installOption !== 'INSTALLATION') return { refusal: null, afterStock: false };
  if (!allInStock) return { refusal: null, afterStock: !f.installDate };
  return { refusal: f.installDate ? null : INSTALL_DATE_REQUIRED, afterStock: false };
}

/** "Thu, 1 Oct 2026", "After stock arrives", "Not set" — the order's installation as the screens show it. */
export function installationText(f: { installOption: string | null; installDate: string | null; afterStock: boolean }): string | null {
  if (!f.installOption) return null;
  if (f.installOption !== 'INSTALLATION') return INSTALL_OPTION_LABEL[f.installOption as InstallOption] ?? f.installOption;
  if (f.installDate) return `Preferred ${dayText(f.installDate)}`;
  return f.afterStock ? 'After stock arrives' : 'Date not set';
}
