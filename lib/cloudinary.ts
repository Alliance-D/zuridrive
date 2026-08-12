// Cloudinary Image Service Helpers

export function generateCloudinarySignature(
  timestamp: number,
  publicId: string
): {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
} {
  // This is a simplified version - implement proper signature generation
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";

  return {
    cloudName,
    apiKey,
    timestamp,
    signature: "", // Implement proper signature generation
  };
}

export function buildCloudinaryUrl(publicId: string, options?: any): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;

  const transformations = [];
  if (options?.width) transformations.push(`w_${options.width}`);
  if (options?.height) transformations.push(`h_${options.height}`);
  if (options?.crop) transformations.push(`c_${options.crop}`);
  if (options?.quality) transformations.push(`q_${options.quality}`);

  const path = transformations.length > 0 ? transformations.join(",") : "";

  return `${baseUrl}${path ? "/" + path : ""}/${publicId}`;
}

export const cloudinaryConfig = {
  cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  uploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
};
