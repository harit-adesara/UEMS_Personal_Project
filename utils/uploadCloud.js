import cloudinary from "../db/cloudinary.js";
import { ApiError } from "./api_error.js";

export const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return reject(new ApiError(400, "File is required"));
    }

    let resourceType;
    let allowedMimeTypes = [];

    if (file.mimetype === "application/pdf") {
      resourceType = "raw";
      allowedMimeTypes = ["application/pdf"];
    } else if (file.mimetype.startsWith("image/")) {
      resourceType = "image";
      allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg"];
    } else {
      return reject(new ApiError(422, "Unsupported file type"));
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return reject(
        new ApiError(422, "Only PDF or JPG/PNG images are allowed"),
      );
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    stream.on("error", (err) => reject(err));

    stream.end(file.buffer);
  });
};
