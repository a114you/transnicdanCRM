declare module "chassi" {
  export interface DecodeVinOptions {
    strict?: boolean;
    includeComponents?: boolean;
  }

  export interface VinDecodeResult {
    vin: string;
    valid: boolean;
    manufacturer: string | null;
    country: string | null;
    countryCode: string | null;
    year: number | null;
    possibleYears: number[];
    model: string | null;
    confidence: number;
    disclaimer: string;
    components?: {
      wmi?: string;
      vds?: string;
      vis?: string;
      yearCode?: string;
      plantCode?: string;
      sequential?: string;
    };
  }

  export interface ValidateVinOptions {
    strictCheckDigit?: boolean;
  }

  export interface VinValidationResult {
    valid: boolean;
    vin: string;
    normalizedVin: string;
    errors: Array<{ code: string; message: string }>;
    details: {
      lengthValid: boolean;
      charactersValid: boolean;
      checkDigitValid: boolean;
      checkDigitApplicable?: boolean;
      providedCheckDigit?: string;
      calculatedCheckDigit?: string;
    };
  }

  export function decodeVin(vin: string, options?: DecodeVinOptions): VinDecodeResult;
  export function validateVin(vin: string, options?: ValidateVinOptions): VinValidationResult;
  export function isValidVin(vin: string): boolean;
  export function normalizeVin(vin: string): string;
}
