export interface StudentCsvRow {
  full_name?: string;
  dob?: string;
  gender?: string;
  class_name?: string;
  section_name?: string;
  roll_no?: string;
  guardian_full_name?: string;
  guardian_phone?: string;
  guardian_relation?: string;
}

export interface ImportRowError {
  row: number;
  error: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}
