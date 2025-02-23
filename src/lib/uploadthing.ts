import {
  generateSolidHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/solid";

import type { UploadRouter } from "~/server/uploadthing";

// URL is only needed for server side rendering, or when your router
// is deployed on a different path than `/api/uploadthing`
const url = `http://localhost:${process.env.PORT ?? 3000}`;

export const UploadButton = generateUploadButton<UploadRouter>({ url });
export const UploadDropzone = generateUploadDropzone<UploadRouter>({ url });
export const { createUploadThing } = generateSolidHelpers<UploadRouter>({
  url,
});
