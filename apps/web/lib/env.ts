const DEFAULT_API_URL = "http://localhost:3001";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    `NEXT_PUBLIC_API_URL is not set — falling back to ${DEFAULT_API_URL}. Copy .env.example to .env.local to configure it explicitly.`,
  );
}

export const env = {
  apiUrl,
};
