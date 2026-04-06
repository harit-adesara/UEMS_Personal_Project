import cloudinary from "../db/cloudinary.js";
import { ApiError } from "./api_error.js";

export const uploadToCloudinary = (file, folder, type) => {
  return new Promise((resolve, reject) => {
    if (type === "image") {
      const allowed = ["image/jpeg", "image/png"];
      if (!allowed.includes(file.mimeType)) {
        return reject(new ApiError(422, "Only PNG/JPG image is allowed"));
      }
    }
    if (type === "pdf") {
      if (file.mimeType !== "application/pdf") {
        return reject(new ApiError(422, "Only pdf is allowed"));
      }
    }

    const resourceType = type === "pdf" ? "raw" : "image";

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        allowed_formats: type === "image" ? ["jpeg", "png", "jpg"] : ["pdf"],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );
    stream.on("error", (err) => {
      reject(err);
    });
    stream.end(file.buffer);
  });
};
