/**
 * ICS Company Office Locations Configuration by Branch.
 * Coimbatore: Head Office (Podanur)
 * Other branches: Respective branch office locations for localized return travel & distance calculations.
 */

export interface OfficeLocation {
  name: string;
  company: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
  branchId: string;
}

export const BRANCH_OFFICE_LOCATIONS: Record<string, OfficeLocation> = {
  cbe: {
    name: 'ICS Head Office (Podanur)',
    company: 'Infant Computer Store (ICS)',
    address: '240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023',
    city: 'Coimbatore',
    latitude: 10.959058,
    longitude: 76.979215,
    phone: '96266 44496',
    branchId: 'cbe',
  },
  chennai: {
    name: 'ICS Chennai Branch Office',
    company: 'Infant Computer Store (Chennai)',
    address: 'Mount Road, Anna Salai, Chennai, Tamil Nadu - 600002',
    city: 'Chennai',
    latitude: 13.067439,
    longitude: 80.260513,
    phone: '96266 44496',
    branchId: 'chennai',
  },
  tirupur: {
    name: 'ICS Tirupur Branch Office',
    company: 'Infant Computer Store (Tirupur)',
    address: 'Avinashi Road, Pushpa Theatre Junction, Tirupur, Tamil Nadu - 641602',
    city: 'Tirupur',
    latitude: 11.108524,
    longitude: 77.341065,
    phone: '96266 44496',
    branchId: 'tirupur',
  },
  salem: {
    name: 'ICS Salem Branch Office',
    company: 'Infant Computer Store (Salem)',
    address: 'Omalur Main Road, Five Roads, Salem, Tamil Nadu - 636004',
    city: 'Salem',
    latitude: 11.664325,
    longitude: 78.146011,
    phone: '96266 44496',
    branchId: 'salem',
  },
  bengaluru: {
    name: 'ICS Bengaluru Branch Office',
    company: 'Infant Computer Store (Bengaluru)',
    address: 'Hosur Main Road, Koramangala / Electronic City, Bengaluru, Karnataka - 560095',
    city: 'Bengaluru',
    latitude: 12.935242,
    longitude: 77.624462,
    phone: '96266 44496',
    branchId: 'bengaluru',
  },
  madurai: {
    name: 'ICS Madurai Branch Office',
    company: 'Infant Computer Store (Madurai)',
    address: 'KK Nagar, Near Mattuthavani, Madurai, Tamil Nadu - 625020',
    city: 'Madurai',
    latitude: 9.932454,
    longitude: 78.148562,
    phone: '96266 44496',
    branchId: 'madurai',
  },
  trichy: {
    name: 'ICS Trichy Branch Office',
    company: 'Infant Computer Store (Trichy)',
    address: 'Thillai Nagar, Trichy, Tamil Nadu - 620018',
    city: 'Trichy',
    latitude: 10.827102,
    longitude: 78.689026,
    phone: '96266 44496',
    branchId: 'trichy',
  },
  pollachi: {
    name: 'ICS Pollachi Branch Office',
    company: 'Infant Computer Store (Pollachi)',
    address: 'Palakkad Road, Pollachi, Tamil Nadu - 642001',
    city: 'Pollachi',
    latitude: 10.660912,
    longitude: 77.004815,
    phone: '96266 44496',
    branchId: 'pollachi',
  },
  erode: {
    name: 'ICS Erode Branch Office',
    company: 'Infant Computer Store (Erode)',
    address: 'Brough Road, Erode, Tamil Nadu - 638001',
    city: 'Erode',
    latitude: 11.341036,
    longitude: 77.717164,
    phone: '96266 44496',
    branchId: 'erode',
  },
  ooty: {
    name: 'ICS Ooty Branch Office',
    company: 'Infant Computer Store (Ooty)',
    address: 'Commercial Road, Ooty, The Nilgiris, Tamil Nadu - 643001',
    city: 'Ooty',
    latitude: 11.410214,
    longitude: 76.695025,
    phone: '96266 44496',
    branchId: 'ooty',
  },
  hosur: {
    name: 'ICS Hosur Branch Office',
    company: 'Infant Computer Store (Hosur)',
    address: 'Bagalur Road, Hosur, Tamil Nadu - 635109',
    city: 'Hosur',
    latitude: 12.740915,
    longitude: 77.825312,
    phone: '96266 44496',
    branchId: 'hosur',
  },
  tirunelveli: {
    name: 'ICS Tirunelveli Branch Office',
    company: 'Infant Computer Store (Tirunelveli)',
    address: 'Palayamkottai, Tirunelveli, Tamil Nadu - 627002',
    city: 'Tirunelveli',
    latitude: 8.713912,
    longitude: 77.756721,
    phone: '96266 44496',
    branchId: 'tirunelveli',
  },
};

/**
 * Default Head Office in Podanur, Coimbatore
 */
export const ICS_OFFICE_LOCATION: OfficeLocation = BRANCH_OFFICE_LOCATIONS.cbe;

/**
 * Returns the exact office location for a given branch ID.
 * Defaults to Coimbatore Head Office (Podanur) if branch is 'cbe' or unrecognized.
 */
export function getOfficeLocationForBranch(branchId?: string | null): OfficeLocation {
  if (!branchId) return BRANCH_OFFICE_LOCATIONS.cbe;
  const norm = branchId.trim().toLowerCase();
  return BRANCH_OFFICE_LOCATIONS[norm] || BRANCH_OFFICE_LOCATIONS.cbe;
}
