/**
 * Canonical list of department names.
 *
 * The names match the values returned by `inferDepartmentFromIncidentType` in
 * SuperAdminDashboard, so the buttons in the "Department Filter" always line up
 * with the department shown on each incident card even before any incident has
 * loaded (or when there are no incidents at all).
 *
 * Shared by:
 *  - SuperAdminDashboard's Department Filter, and
 *  - the Add Admin card, where the super admin picks the new admin's
 *    department from a <select>.
 */
export const DEPARTMENT_OPTIONS: string[] = [
  'General',
  'Municipal Authority',
  'Fire Department',
  'Traffic Police',
  'Water Management',
  'Disaster Management',
  'Sanitation Department',
  'Roads & Infrastructure',
];

/**
 * Merges extra department names (for example the ones discovered from loaded
 * incidents or existing admins) with the canonical list, de-duplicating while
 * keeping the canonical order first.
 */
export const withDefaultDepartments = (
  values: Array<string | null | undefined>,
): string[] =>
  [
    ...new Set([
      ...DEPARTMENT_OPTIONS,
      ...values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ]),
  ];
