import type { SearchCriteria } from '@/lib/types';

/** Default criteria — mirrors the seed row in supabase/schema.sql. */
export const DEFAULT_CRITERIA: Omit<SearchCriteria, 'id' | 'updated_at'> = {
  target_roles: ['Software Engineer', 'Senior Software Engineer', 'Backend Engineer', 'SDE 2', 'SDE II', 'Java Developer'],
  experience_level: 'mid',
  min_years: 2,
  max_years: 6,
  include_keywords: ['java', 'spring', 'kafka', 'microservices', 'backend', 'distributed'],
  exclude_keywords: ['intern', 'internship', 'principal', 'staff', 'director', 'manager', 'head of'],
  locations: ['Bengaluru', 'Bangalore', 'Gurugram', 'Gurgaon', 'Delhi', 'Noida', 'Hyderabad', 'Pune', 'Remote', 'India'],
  remote_ok: true,
  email_enabled: true,
  email_to: 'ranaavijit80@gmail.com',
};
