export interface SigmaApiServer {
  label: string;
  url: string;
}

export const SIGMA_API_SERVERS: SigmaApiServer[] = [
  { label: 'GCP (US)', url: 'https://api.sigmacomputing.com' },
  { label: 'GCP (KSA)', url: 'https://api.sa.gcp.sigmacomputing.com' },
  { label: 'AWS US (West)', url: 'https://aws-api.sigmacomputing.com' },
  { label: 'AWS US (East)', url: 'https://api.us-a.aws.sigmacomputing.com' },
  { label: 'AWS Canada', url: 'https://api.ca.aws.sigmacomputing.com' },
  { label: 'AWS Europe', url: 'https://api.eu.aws.sigmacomputing.com' },
  { label: 'AWS Australia & APAC', url: 'https://api.au.aws.sigmacomputing.com' },
  { label: 'AWS UK', url: 'https://api.uk.aws.sigmacomputing.com' },
  { label: 'Azure US', url: 'https://api.us.azure.sigmacomputing.com' },
  { label: 'Azure Europe', url: 'https://api.eu.azure.sigmacomputing.com' },
  { label: 'Azure Canada', url: 'https://api.ca.azure.sigmacomputing.com' },
  { label: 'Azure UK', url: 'https://api.uk.azure.sigmacomputing.com' },
];

export const DEFAULT_SIGMA_API_SERVER = SIGMA_API_SERVERS[0].url;
