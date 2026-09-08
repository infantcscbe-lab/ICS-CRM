/**
 * ICS Company Office Location Configuration
 */

export interface OfficeLocation {
  name: string;
  company: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
}

export const ICS_OFFICE_LOCATION: OfficeLocation = {
  name: 'ICS Head Office',
  company: 'Infant Computer Store (ICS)',
  address: '240/A28, Sharadha Mill Road, Podanur, Coimbatore - 641023',
  city: 'Coimbatore',
  latitude: 10.9632,
  longitude: 76.9948,
  phone: '96266 44496',
};
