/**
 * Canonical list of department names.
 *
 * The incidents are strictly related to departments as:
 *   Potholes      -> Public Works Department
 *   Garbage       -> Solid Waste Management
 *   Flood         -> Disaster Management
 *   Water Logging -> Storm Water Drains
 *   Accidents     -> Traffic Police & Disaster Management
 *   Landslide     -> Disaster Management
 *   Fire          -> Fire Department
 *
 * Shared by:
 *  - SuperAdminDashboard's Department Filter (<select> on the All Incidents tab),
 *  - the Add Admin card, where the super admin picks the new admin's
 *    department from a <select>,
 *  - the incident -> department mapping used to scope what each departmental
 *    admin is allowed to see (CheckReports, MapView, Notifications).
 *
 * The Super Admin is never scoped - super admin sees every report.
 */
export const DEPARTMENT_OPTIONS: string[] = [
  'Public Works Department',
  'Solid Waste Management',
  'Disaster Management',
  'Storm Water Drains',
  'Traffic Police',
  'Fire Department',
];

/**
 * Older releases used a few other department names (free text / previous
 * canonical list). Map them onto the current list so existing admins and
 * existing incidents keep matching the right department.
 */
const LEGACY_DEPARTMENT_ALIASES: Record<string, string> = {
  'sanitation department': 'Solid Waste Management',
  'roads & infrastructure': 'Public Works Department',
  'road and infrastructure': 'Public Works Department',
  'water management': 'Storm Water Drains',
  'public works': 'Public Works Department',
};

/**
 * Normalizes any stored department name onto the canonical list.
 * Returns '' when the value is empty and the raw (trimmed) value when it
 * cannot be mapped - callers can then detect unmapped departments.
 */
export const normalizeDepartmentName = (value?: string | null): string => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  const canonical = DEPARTMENT_OPTIONS.find((option) => option.toLowerCase() === lower);
  if (canonical) return canonical;

  return LEGACY_DEPARTMENT_ALIASES[lower] || trimmed;
};

interface IncidentDepartmentRule {
  keywords: string[];
  departments: string[];
}

/**
 * Keyword rules evaluated top-to-bottom against the lower-cased incident type.
 * An incident may belong to more than one department (accidents belong to both
 * Traffic Police and Disaster Management). Incident types that match no rule
 * belong to no department - only the Super Admin sees them.
 */
const INCIDENT_DEPARTMENT_RULES: IncidentDepartmentRule[] = [
  { keywords: ['fire'], departments: ['Fire Department'] },
  {
    keywords: ['accident', 'collision', 'crash'],
    departments: ['Traffic Police', 'Disaster Management'],
  },
  { keywords: ['landslide'], departments: ['Disaster Management'] },
  { keywords: ['flood'], departments: ['Disaster Management'] },
  {
    keywords: ['water logging', 'waterlogging', 'water-logging', 'water logged', 'waterlogged', 'puddle', 'standing water'],
    departments: ['Storm Water Drains'],
  },
  {
    keywords: ['garbage', 'waste', 'sanitation', 'litter'],
    departments: ['Solid Waste Management'],
  },
  { keywords: ['pothole'], departments: ['Public Works Department'] },
];

/** Departments an incident belongs to, derived from its incident type. */
export const getDepartmentsForIncidentType = (incidentType?: string | null): string[] => {
  const type = incidentType?.trim().toLowerCase() || '';
  if (!type) return [];

  for (const rule of INCIDENT_DEPARTMENT_RULES) {
    if (rule.keywords.some((keyword) => type.includes(keyword))) {
      return [...rule.departments];
    }
  }

  return [];
};

/**
 * Representative incident type used when an incident is transferred INTO a
 * department and the AI model's predicted label does not already route there.
 *
 * These are the canonical types the INCIDENT_DEPARTMENT_RULES keywords are
 * built around, so writing one of these as the new `incident_type` is what
 * makes the report belong to that department (department membership in this
 * app is derived from the incident type - there is no stored department
 * column on incident_reports).
 */
export const DEPARTMENT_CANONICAL_INCIDENT_TYPE: Record<string, string> = {
  'Public Works Department': 'Pothole',
  'Solid Waste Management': 'Garbage',
  'Disaster Management': 'Flood',
  'Storm Water Drains': 'Water Logging',
  'Traffic Police': 'Accident',
  'Fire Department': 'Fire',
};

/**
 * Departments an incident can be transferred to: every canonical department
 * except the ones it already belongs to ("a different department").
 */
export const getTransferableDepartments = (incidentType?: string | null): string[] => {
  const current = getDepartmentsForIncidentType(incidentType);
  return DEPARTMENT_OPTIONS.filter((department) => !current.includes(department));
};

/**
 * Whether a departmental officer (admin) with the given department may see the
 * incident. The Super Admin must bypass this (pass no department / null).
 *
 * - No department given (super admin / regular user) -> visible (not scoped).
 * - Department is UNASSIGNED_DEPARTMENT or can't be mapped -> hidden.
 * - Incident maps to no department -> hidden from everyone but the Super Admin.
 */
export const canDepartmentViewIncident = (
  incidentType: string | null | undefined,
  department: string | null | undefined,
): boolean => {
  const scopedDepartment = department?.trim();
  if (!scopedDepartment) return true;

  return getDepartmentsForIncidentType(incidentType).includes(scopedDepartment);
};

/**
 * Sentinel used when a department could not be resolved. It intentionally
 * matches none of the incident rules, so anything scoped to it sees nothing.
 */
export const UNASSIGNED_DEPARTMENT = 'Unassigned';

/**
 * Resolves the department an admin ("departmental officer") is scoped to, from
 * the logged-in user stored in localStorage.
 *
 * - Super admins and regular users are never scoped -> null, which means
 *   "no restriction, show every report".
 * - An admin is ALWAYS scoped. When their department cannot be resolved the
 *   sentinel UNASSIGNED_DEPARTMENT is returned, which matches no incident, so
 *   such an admin sees nothing rather than every other department's reports.
 * - Legacy free-text department names are mapped onto the canonical list.
 */
export const getAdminScopedDepartment = (user: any): string | null => {
  if (!user || user.role !== 'admin') return null;

  const raw =
    user.profile?.department_name ??
    user.profile?.department ??
    user.department_name ??
    user.department ??
    null;

  return normalizeDepartmentName(raw) || UNASSIGNED_DEPARTMENT;
};

