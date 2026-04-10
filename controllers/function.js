import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.js";
import { Event } from "../models/event.js";
import { Branch } from "../models/branch.js";
import { School } from "../models/school.js";
import { Division } from "../models/division.js";
import { registerEmail, sendEmail } from "../utils/mail.js";
import { uploadToCloudinary } from "../utils/uploadCloud.js";
import cloudinary from "../db/cloudinary.js";
import mongoose from "mongoose";

const validateSchool = async (school) => {
  if (!school) return null;
  const query = mongoose.Types.ObjectId.isValid(school)
    ? { _id: school }
    : { name: school };
  const schoolObj = await School.findOne(query);
  if (!schoolObj || schoolObj.isDeleted) {
    throw new ApiError(400, "Invalid school");
  }
  return schoolObj._id;
}; // complete

const validateBranch = async (branch, school) => {
  if (!branch) return null;

  if (!school) {
    throw new ApiError(400, "School is required for branch validation");
  }

  let schoolId;
  if (mongoose.Types.ObjectId.isValid(school)) {
    schoolId = school.toString();
  } else {
    const schoolObj = await School.findOne({ name: school });
    if (!schoolObj || schoolObj.isDeleted) {
      throw new ApiError(400, "Invalid school");
    }
    schoolId = schoolObj._id.toString();
  }

  let branchObj;

  if (mongoose.Types.ObjectId.isValid(branch)) {
    branchObj = await Branch.findOne({
      _id: branch,
      school: schoolId,
    });
  } else {
    branchObj = await Branch.findOne({
      name: branch,
      school: schoolId,
    });
  }

  if (!branchObj || branchObj.isDeleted) {
    throw new ApiError(400, "Invalid branch for given school");
  }

  return branchObj._id;
}; // complete

const validateDivision = async (division, branch) => {
  if (!division) return null;

  if (!branch) {
    throw new ApiError(400, "Branch is required for division validation");
  }

  let branchId;
  if (mongoose.Types.ObjectId.isValid(branch)) {
    branchId = branch.toString();
  } else {
    const branchObj = await Branch.findOne({ name: branch });
    if (!branchObj || branchObj.isDeleted) {
      throw new ApiError(400, "Invalid branch");
    }
    branchId = branchObj._id.toString();
  }

  let divisionObj;

  if (mongoose.Types.ObjectId.isValid(division)) {
    divisionObj = await Division.findOne({
      _id: division,
      branch: branchId,
    });
  } else {
    divisionObj = await Division.findOne({
      name: division,
      branch: branchId,
    });
  }

  if (!divisionObj || divisionObj.isDeleted) {
    throw new ApiError(400, "Invalid division for given branch");
  }

  return divisionObj._id;
}; // complete

const createUser = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(403, "Unauthorized user");
  }

  let { fullname, email, role, roll_number, division, school, branch, year } =
    req.body;

  const password = process.env.temp_password;

  if (!fullname || !email || !role) {
    throw new ApiError(400, "Missing required fields");
  }

  if (role === "Student") {
    if (!roll_number || !division || !school || !branch || !year) {
      throw new ApiError(
        400,
        "roll_number, division, school,year and branch required",
      );
    }
  }

  if ((role === "HoD" || role === "Faculty") && !branch && !school) {
    throw new ApiError(400, "Branch and School required for HoD");
  }

  if (role === "Dean" && !school) {
    throw new ApiError(400, "School required for Dean");
  }

  if (school) school = await validateSchool(school);
  if (branch) branch = await validateBranch(branch, school);
  if (division) division = await validateDivision(division, branch);

  let user = await User.findOne({ email });

  if (user && user.status !== "deleted") {
    throw new ApiError(409, "User already exists");
  }

  if (user) {
    if (user.status === "deleted") {
      user.fullname = fullname;
      user.role = role;
      user.password = password;
      user.status = "inactive";
      user.year = role === "Student" ? year : undefined;
      user.roll_number = role === "Student" ? roll_number : undefined;
      user.school = role === "Student" || role === "Dean" ? school : undefined;
      user.branch = role === "Student" || role === "HoD" ? branch : undefined;
      user.division = role === "Student" ? division : undefined;

      user = await user.save();
    } else {
      throw new ApiError(409, "User already exists");
    }
  } else {
    user = await User.create({
      fullname,
      email,
      password,
      status: "inactive",
      role,
      year: role === "Student" ? year : undefined,
      roll_number: role === "Student" ? roll_number : undefined,
      school: role === "Student" || role === "Dean" ? school : undefined,
      branch: role === "Student" || role === "HoD" ? branch : undefined,
      division: role === "Student" ? division : undefined,
    });
  }

  const { unHashedToken, hashedToken, tokenExpiry } =
    user.generateTemporaryToken();

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpiry = tokenExpiry;

  await user.save();

  await sendEmail({
    email: user.email,
    subject: "Password set email",
    mailgenContent: registerEmail(
      user.fullname,
      `${process.env.registerUrl}/${unHashedToken}`,
    ),
  });

  return res
    .status(201)
    .json(new ApiResponse(201, user, "User created successfully"));
}); // complete

const getEvent = asyncHandler(async (req, res) => {
  try {
    if (req.user.role === "Admin") {
      let filter = {};
      if (req.query.date) {
        const start = new Date(req.query.date);
        const end = new Date(req.query.date);
        end.setHours(23, 59, 59, 999);

        filter.startTime = {
          $gte: start,
          $lte: end,
        };
      } else {
        filter.startTime = { $gte: new Date() };
      }
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.organizedBy) {
        filter.organizedBy = req.query.organizedBy;
      }
      if (req.query.name) {
        filter.name = req.query.name;
      }

      const sortOrder =
        req.query.order === "asc" ? 1 : req.query.order === "desc" ? -1 : -1;

      const events = await Event.find(filter).sort({ startTime: sortOrder });
      if (events.length === 0) {
        throw new ApiError(404, "Events not found");
      }
      return res
        .status(200)
        .json(new ApiResponse(200, { events }, "Event fetched successfully"));
    }
  } catch (error) {
    throw new ApiError(404, "Event not found");
  }
}); // complete

const getUser = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email })
      .populate("Division", "name")
      .populate("Branch", "name")
      .populate("School", "name");
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { user }, "User fetched successfully"));
  } catch (error) {
    throw new ApiError(404, "Erro while fetching user");
  }
}); // complete

const eventStatusApprove = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { eventId } = req.params;
    const { reason } = req.body;
    if (!eventId) {
      throw new ApiError(404, "Error while selecting event");
    }
    const event = await Event.findById(eventId);
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    event.status = "Approved";
    event.approvalHistory.push({
      user: req.user._id,
      role: req.user.role,
      status: "Approved",
      reason: reason || "Not mentioned",
      timestamp: new Date(),
    });
    await event.save();
    return res.status(200).json(200, "Event accepted");
  } catch (error) {
    throw new ApiError(404, "Error while approving event");
  }
}); // complete

const eventStatusReject = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { eventId } = req.params;
    const { reason } = req.body;
    if (!eventId) {
      throw new ApiError(404, "Error while selecting event");
    }
    const event = await Event.findById(eventId);
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    event.status = "Rejected";
    event.approvalHistory.push({
      user: req.user._id,
      role: req.user.role,
      status: "Rejected",
      reason: reason || "Not mentioned",
      timestamp: new Date(),
    });
    await event.save();
    return res.status(200).json(200, "Event rejected");
  } catch (error) {
    throw new ApiError(404, "Error while rejecting event");
  }
}); // complete

const modifyUser = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(403, "Unauthorized user");
  }

  const { userId, ...updates } = req.body;
  if (!userId) throw new ApiError(400, "user id is required to identify user");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const allowedFields = [
    "fullname",
    "role",
    "roll_number",
    "school",
    "branch",
    "division",
    "year",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  if (updates.school) updates.school = await validateSchool(updates.school);
  if (updates.branch)
    updates.branch = await validateBranch(
      updates.branch,
      updates.school || user.school,
    );
  if (updates.division)
    updates.division = await validateDivision(
      updates.division,
      updates.branch || user.branch,
    );

  for (const key of Object.keys(updates)) {
    user[key] = updates[key];
  }

  const role = updates.role || user.role;

  if (role !== "Student") {
    user.roll_number = undefined;
    user.division = undefined;
  }

  if (!["HoD", "Faculty"].includes(role)) {
    user.branch = undefined;
  }

  if (!["HoD", "Faculty", "Dean"].includes(role)) {
    user.school = undefined;
  }

  if (role === "Student") {
    if (
      !user.roll_number ||
      !user.division ||
      !user.school ||
      !user.branch ||
      !user.year
    ) {
      throw new ApiError(
        400,
        "Student requires roll_number, division, school,year and branch",
      );
    }
  }
  if (role === "Student") {
    if (
      !user.roll_number ||
      !user.division ||
      !user.school ||
      !user.branch ||
      !user.year
    ) {
      throw new ApiError(
        400,
        "Student requires roll_number, division, school, branch, and year",
      );
    }
  }
  if (["HoD", "Faculty"].includes(role)) {
    if (!user.branch || !user.school) {
      throw new ApiError(400, `${role} requires both branch and school`);
    }
  }
  if (role === "Dean" && !user.school) {
    throw new ApiError(400, "Dean requires school");
  }

  await user.save();

  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
}); // complete

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const user = await User.findById(userId);

  if (!user || user.status === "deleted") {
    throw new ApiError(404, "User not found");
  }

  user.status = "deleted";

  user.refreshToken = undefined;

  await user.save();

  res.status(200).json(new ApiResponse(200, {}, "User deleted successfully"));
}); // complete

const deleteFromCloudinary = async (public_id, type) => {
  if (!public_id) return;

  const resource_type = type === "pdf" ? "raw" : "image";
  await cloudinary.uploader.destroy(public_id, { resource_type });
};

const modifyEvent = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(403, "Unauthorized user");
  }

  const { eventId, ...updates } = req.body;

  if (!eventId) {
    throw new ApiError(400, "Event ID is required");
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  const restrictedFields = ["status", "approvalHistory", "organizedBy"];

  const allowedFields = [
    "name",
    "detail",
    "targets",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
    "amount",
  ];

  for (const key of Object.keys(updates)) {
    if (restrictedFields.includes(key)) {
      throw new ApiError(400, `${key} cannot be updated`);
    }

    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  if (updates.name) {
    const year = updates.startTime
      ? new Date(updates.startTime).getFullYear()
      : event.startTime.getFullYear();

    const name = updates.name || event.name;

    const existing = await Event.findOne({ name, year });

    if (existing && existing._id.toString() !== eventId) {
      throw new ApiError(
        400,
        `Event "${name}" already exists for year ${year}`,
      );
    }
  }

  let level = "";
  let status = "";

  if (updates.targets) {
    const parsedTargets = JSON.parse(updates.targets);

    for (const t of parsedTargets) {
      if (t.school) {
        t.school = await validateSchool(t.school);
      } else {
        if (t.branches?.length) {
          throw new ApiError(
            400,
            "Cannot select branch without selecting school",
          );
        }
        continue;
      }

      for (const b of t.branches || []) {
        if (!b.branch) {
          throw new ApiError(400, "Branch is required if selected");
        }
        b.branch = await validateBranch(b.branch, t.school);

        if (b.StudentYear != null) {
          if (!t.school || !b.branch) {
            throw new ApiError(
              400,
              "Cannot select year without selecting school and branch",
            );
          }
          if (b.StudentYear < 1 || b.StudentYear > 5) {
            throw new ApiError(400, "Invalid StudentYear");
          }
        }

        if (b.divisions?.length) {
          if (!t.school || !b.branch || b.StudentYear == null) {
            throw new ApiError(
              400,
              "Cannot select divisions without selecting school, branch, and year",
            );
          }

          let divisionIds = [];
          for (let k = 0; k < b.divisions.length; k++) {
            const divisionId = await validateDivision(b.divisions[k], b.branch);
            divisionIds.push(divisionId);
          }
          b.divisions = divisionIds;
        }
      }
    }

    ({ level, status } = await determineEventLevel(parsedTargets));

    const organizer = await User.findById(event.organizedBy).select("role");

    if (organizer.role === "Club" && level === "Division") {
      throw new ApiError(
        400,
        "Club cannot create or modify to division level event",
      );
    }
    updates.targets = parsedTargets;
  }

  const newStart = updates.startTime
    ? new Date(updates.startTime)
    : event.startTime;

  const newEnd = updates.endTime ? new Date(updates.endTime) : event.endTime;

  const newDeadline = updates.registrationDeadline
    ? new Date(updates.registrationDeadline)
    : event.registrationDeadline;

  if (newEnd && newEnd < newStart) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (newDeadline && newDeadline > newStart) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  if (updates.amount !== undefined && updates.amount < 0) {
    throw new ApiError(400, "Amount cannot be negative");
  }

  allowedFields.forEach((key) => {
    if (updates[key] !== undefined) {
      event[key] = updates[key];
    }
  });

  const photoFile = req.files?.photo?.[0];
  const epsFile = req.files?.eps?.[0];

  if (photoFile) {
    const uploadedPhoto = await uploadToCloudinary(
      photoFile,
      "events/photo",
      "image",
    );

    if (event.photo?.public_id) {
      await deleteFromCloudinary(event.photo.public_id, "image");
    }

    event.photo = uploadedPhoto;
  }

  if (epsFile) {
    const uploadedEps = await uploadToCloudinary(epsFile, "events/eps", "pdf");

    if (event.eps?.public_id) {
      await deleteFromCloudinary(event.eps.public_id, "pdf");
    }

    event.eps = uploadedEps;
  }

  if (level) event.level = level;
  if (status) event.status = status;

  await event.save();

  return res
    .status(200)
    .json(new ApiResponse(200, event, "Event updated successfully"));
}); // complete

const createBranch = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { name, school } = req.body;

    if (!name || !school) {
      throw new ApiError(404, "Name and School require");
    }

    const existing = await Branch.findOne({
      $and: [{ name }, { school }],
    });

    if (existing && existing.isDeleted === false) {
      throw new ApiError(404, "This branch already exists");
    }

    const branch = await Branch.create({
      name,
      school,
      isDeleted: false,
    });
    if (!branch) {
      throw new ApiError(404, "Error while creating branch");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { branch }, "Branch created successfully"));
  } catch (error) {
    throw new ApiError(404, "Error while creating branch");
  }
}); // complete

const createSchool = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { name } = req.body;

    if (!name) {
      throw new ApiError(404, "Name require");
    }

    const existing = await School.findOne({ name });

    if (existing && existing.isDeleted === false) {
      throw new ApiError(404, "This school already exists");
    }

    const school = await School.create({
      name,
      isDeleted: false,
    });
    if (!school) {
      throw new ApiError(404, "Error while creating school");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { school }, "school created successfully"));
  } catch (error) {
    throw new ApiError(404, "Error while creating school");
  }
}); // complete

const createDivision = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { name, branch } = req.body;

    if (!name || !branch) {
      throw new ApiError(404, "Name and Branch require");
    }

    const existing = await Division.findOne({
      $and: [{ name }, { branch }],
    });

    if (existing && existing.isDeleted === false) {
      throw new ApiError(404, "This division already exists");
    }

    const division = await Division.create({
      name,
      branch,
      isDeleted: false,
    });
    if (!division) {
      throw new ApiError(404, "Error while creating division");
    }
    return res
      .status(200)
      .json(
        new ApiResponse(200, { division }, "division created successfully"),
      );
  } catch (error) {
    throw new ApiError(404, "Error while creating division");
  }
}); // complete

const getBranch = asyncHandler(async (req, res) => {
  const { name, school } = await req.body;

  if (!name || !school) {
    throw new ApiError(404, "Name or school not found");
  }

  const schoolObj = await School.find({ name: school });

  const branch = await Branch.findOne({ name: name, school: schoolObj._id });
  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { branch }, "Branch fetched successfully"));
}); // complete

const getSchool = asyncHandler(async (req, res) => {
  const { name } = await req.body;

  if (!name) {
    throw new ApiError(404, "name not found");
  }

  const school = await Branch.findOne({ name: name });
  if (!school) {
    throw new ApiError(404, "School not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { school }, "School fetched successfully"));
}); // complete

const getDivision = asyncHandler(async (req, res) => {
  const { name, branch } = req.body;
  if (!name || !branch) {
    throw new ApiError(404, "Name or branch not found");
  }
  const branchObj = await Branch.find({ name: branch });
  const division = await Division.find({ name: name, branch: branchObj._id });
  if (!division) {
    throw new ApiError(404, "Division not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { division }, "Division fetched successfully"));
}); // complete

const modifyBranch = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { branchId, ...updates } = req.body;

    if (!branchId) {
      throw new ApiError(400, "Branch ID is required");
    }

    const branch = await Branch.findById(branchId);

    if (!branch || branch.isDeleted) {
      throw new ApiError(404, "Branch not found");
    }

    const allowedFields = ["name", "school"];

    for (const key of Object.keys(updates)) {
      if (!allowedFields.includes(key)) {
        throw new ApiError(400, `Invalid field: ${key}`);
      }
    }

    const newName =
      updates.name !== undefined ? updates.name.trim() : branch.name;

    const newSchool = updates.school || branch.school;

    if (updates.name !== undefined || updates.school !== undefined) {
      const existing = await Branch.findOne({
        name: newName,
        school: newSchool,
        _id: { $ne: branchId },
      });

      if (existing) {
        throw new ApiError(409, "Branch already exists in this school");
      }
    }

    if (updates.name !== undefined) {
      branch.name = newName;
    }

    if (updates.school !== undefined) {
      branch.school = updates.school;
    }

    await branch.save();

    res
      .status(200)
      .json(new ApiResponse(200, branch, "Branch updated successfully"));
  } catch (error) {
    throw new ApiError(404, "Error while modifying event");
  }
}); // complete

const modifySchool = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
  }

  const { schoolId, ...updates } = req.body;

  if (!schoolId) {
    throw new ApiError(400, "School ID is required");
  }

  const school = await School.findById(schoolId);

  if (!school || school.isDeleted) {
    throw new ApiError(404, "School not found");
  }

  const allowedFields = ["name"];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  const newName =
    updates.name !== undefined ? updates.name.trim() : school.name;

  if (updates.name !== undefined) {
    const existing = await School.findOne({
      name: newName,
      _id: { $ne: schoolId },
    });

    if (existing) {
      throw new ApiError(409, "School already exists");
    }
  }

  if (updates.name !== undefined) {
    school.name = newName;
  }

  await school.save();

  res
    .status(200)
    .json(new ApiResponse(200, school, "School updated successfully"));
}); // complete

const modifyDivision = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
  }

  const { divisionId, ...updates } = req.body;

  if (!divisionId) {
    throw new ApiError(400, "Division ID is required");
  }

  const division = await Division.findById(divisionId);

  if (!division || division.isDeleted) {
    throw new ApiError(404, "Division not found");
  }

  const allowedFields = ["name", "branch"];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  const newName =
    updates.name !== undefined ? updates.name.trim() : division.name;

  const newBranch = updates.branch || division.branch;

  if (updates.name !== undefined || updates.branch !== undefined) {
    const existing = await Division.findOne({
      name: newName,
      branch: newBranch,
      _id: { $ne: divisionId },
    });

    if (existing) {
      throw new ApiError(409, "Division already exists in this branch");
    }
  }

  if (updates.name !== undefined) {
    division.name = newName;
  }

  if (updates.branch !== undefined) {
    division.branch = updates.branch;
  }

  await division.save();

  res
    .status(200)
    .json(new ApiResponse(200, division, "Division updated successfully"));
}); // complete

const deleteBranch = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
  }
  const { branchId } = req.params;

  if (!branchId) {
    throw new ApiError(400, "Branch ID is required");
  }

  const branch = await Branch.findById(branchId);

  if (!branch || branch.isDeleted) {
    throw new ApiError(404, "Branch not found");
  }

  branch.isDeleted = true;

  await branch.save();

  res.status(200).json(new ApiResponse(200, {}, "Branch deleted successfully"));
}); // complete

const deleteDivision = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
  }
  const { divisionId } = req.params;

  if (!divisionId) {
    throw new ApiError(400, "Division ID is required");
  }

  const division = await Division.findById(divisionId);

  if (!division || division.isDeleted) {
    throw new ApiError(404, "Division not found");
  }

  division.isDeleted = true;

  await division.save();

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Division deleted successfully"));
}); // complete

const deleteSchool = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
  }
  const { schoolId } = req.params;

  if (!schoolId) {
    throw new ApiError(400, "School ID is required");
  }

  const school = await School.findById(schoolId);

  if (!school || school.isDeleted) {
    throw new ApiError(404, "School not found");
  }

  school.isDeleted = true;

  await school.save();

  res.status(200).json(new ApiResponse(200, {}, "School deleted successfully"));
}); // complete

export {
  getBranch,
  getSchool,
  getDivision,
  validateSchool,
  validateBranch,
  validateDivision,
  createUser,
  eventStatusApprove,
  eventStatusReject,
  modifyUser,
  deleteUser,
  modifyEvent,
  getUser,
  getEvent,
  createBranch,
  createSchool,
  createDivision,
  modifyBranch,
  modifySchool,
  modifyDivision,
  deleteBranch,
  deleteDivision,
  deleteSchool,
};

// faculty, dean , hod, club , director

//faculty

const getDivisionCount = async (branchId) => {
  if (!branchId) return 0;

  const count = await Division.countDocuments({
    branch: branchId,
    isDeleted: { $ne: true },
  });

  return count;
}; // complete

const determineEventLevel = async (parsedTargets) => {
  if (!parsedTargets || parsedTargets.length === 0) {
    return { level: "College", status: "Pending" };
  }

  if (parsedTargets.length > 1) {
    return { level: "College", status: "Pending" };
  }

  const schoolTarget = parsedTargets[0];

  if (!schoolTarget.branches || schoolTarget.branches.length === 0) {
    return { level: "School", status: "Pending" };
  }

  const validBranches = schoolTarget.branches.filter((b) => b.branch);

  const uniqueBranchCount = new Set(
    validBranches.map((b) => b.branch.toString()),
  ).size;

  if (uniqueBranchCount > 1) {
    return { level: "School", status: "Pending" };
  }

  const branchObj = validBranches[0];

  if (branchObj.StudentYear == null) {
    return { level: "Branch", status: "Pending" };
  }

  let totalDivisions = 0;
  if (branchObj.branch) {
    totalDivisions = await getDivisionCount(branchObj.branch);
  }

  const divisionsSelected = branchObj.divisions?.length || 0;

  if (divisionsSelected === 0 || divisionsSelected === totalDivisions) {
    return { level: "Branch", status: "Pending" };
  }

  return { level: "Division", status: "Approved" };
}; // complete

// Create event
const createEventFaculty = asyncHandler(async (req, res) => {
  if (req.user.role !== "Faculty")
    throw new ApiError(403, "Only faculty can create events");

  const {
    name,
    detail,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount,
    targets,
  } = req.body;
  const epsFile = req.files?.epsFile[0];
  const photo = req.files?.photo[0];

  if (!name || !detail || !startTime || !venue || !targets || !epsFile) {
    throw new ApiError(400, "Missing required fields");
  }

  if (endTime && new Date(endTime) < new Date(startTime)) {
    throw new ApiError(400, "End time must be after start time");
  }
  if (
    registrationDeadline &&
    new Date(registrationDeadline) > new Date(startTime)
  ) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  const parsedTargets = JSON.parse(targets);

  for (const t of parsedTargets) {
    if (t.school) {
      t.school = await validateSchool(t.school);
    } else {
      if (t.branches?.length) {
        throw new ApiError(
          400,
          "Cannot select branch without selecting school",
        );
      }
      continue;
    }

    for (const b of t.branches || []) {
      if (!b.branch) {
        throw new ApiError(400, "Branch is required if selected");
      }
      b.branch = await validateBranch(b.branch, t.school);

      if (b.StudentYear != null) {
        if (!t.school || !b.branch) {
          throw new ApiError(
            400,
            "Cannot select year without selecting school and branch",
          );
        }
        if (b.StudentYear < 1 || b.StudentYear > 5) {
          throw new ApiError(400, "Invalid StudentYear");
        }
      }

      if (b.divisions?.length) {
        if (!t.school || !b.branch || b.StudentYear == null) {
          throw new ApiError(
            400,
            "Cannot select divisions without selecting school, branch, and year",
          );
        }

        let divisionIds = [];
        for (let k = 0; k < b.divisions.length; k++) {
          const divisionId = await validateDivision(b.divisions[k], b.branch);
          divisionIds.push(divisionId);
        }
        b.divisions = divisionIds;
      }
    }
  }

  const year = new Date(startTime).getFullYear();

  const existing = await Event.findOne({ name, year });

  if (existing) {
    throw new ApiError(400, `Event "${name}" already exists for year ${year}`);
  }

  let { level, status } = await determineEventLevel(parsedTargets);

  if (req.user.role === "Faculty" && level === "Division") {
    status = "Approved";
  }

  const uploadedEps = await uploadToCloudinary(epsFile, "events/eps", "pdf");
  const uploadedPhoto = photo
    ? await uploadToCloudinary(photo, "events/photo", "image")
    : null;

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || null,
    eps: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
    level,
    year,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
}); // complete

// HoD

const createEventHoD = asyncHandler(async (req, res) => {
  if (req.user.role !== "HoD") {
    throw new ApiError(404, "Unauthorized error");
  }

  const {
    name,
    detail,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount,
    targets,
  } = req.body;

  const epsFile = req.files?.epsFile[0];
  const photo = req.files?.photo[0];

  if (!name || !detail || !startTime || !venue || !targets || !epsFile) {
    throw new ApiError(400, "Missing required fields");
  }

  if (endTime && new Date(endTime) < new Date(startTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (
    registrationDeadline &&
    new Date(registrationDeadline) > new Date(startTime)
  ) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  const parsedTargets = JSON.parse(targets);

  for (const t of parsedTargets) {
    if (t.school) {
      t.school = await validateSchool(t.school);
    } else {
      if (t.branches?.length) {
        throw new ApiError(
          400,
          "Cannot select branch without selecting school",
        );
      }
      continue;
    }

    for (const b of t.branches || []) {
      if (!b.branch) {
        throw new ApiError(400, "Branch is required if selected");
      }
      b.branch = await validateBranch(b.branch, t.school);

      if (b.StudentYear != null) {
        if (!t.school || !b.branch) {
          throw new ApiError(
            400,
            "Cannot select year without selecting school and branch",
          );
        }
        if (b.StudentYear < 1 || b.StudentYear > 5) {
          throw new ApiError(400, "Invalid StudentYear");
        }
      }

      if (b.divisions?.length) {
        if (!t.school || !b.branch || b.StudentYear == null) {
          throw new ApiError(
            400,
            "Cannot select divisions without selecting school, branch, and year",
          );
        }

        let divisionIds = [];
        for (let k = 0; k < b.divisions.length; k++) {
          const divisionId = await validateDivision(b.divisions[k], b.branch);
          divisionIds.push(divisionId);
        }
        b.divisions = divisionIds;
      }
    }
  }

  const year = new Date(startTime).getFullYear();

  const existing = await Event.findOne({ name, year });

  if (existing) {
    throw new ApiError(400, `Event "${name}" already exists for year ${year}`);
  }

  let { level, status } = await determineEventLevel(parsedTargets);

  if (req.user.role === "HoD" && ["Division", "Branch"].includes(level)) {
    status = "Approved";
  }

  const uploadedEps = await uploadToCloudinary(epsFile, "events/eps");

  let uploadedPhoto = null;
  if (photo) {
    uploadedPhoto = await uploadToCloudinary(photo, "events/photo");
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || null,
    eps: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
    level,
    year,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
}); // complete

// Dean

const createEventDean = asyncHandler(async (req, res) => {
  if (req.user.role !== "Dean") {
    throw new ApiError(404, "Unauthorized error");
  }

  const {
    name,
    detail,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount,
    targets,
  } = req.body;

  const epsFile = req.files?.epsFile[0];
  const photo = req.files?.photo[0];

  if (!name || !detail || !startTime || !venue || !targets || !epsFile) {
    throw new ApiError(400, "Missing required fields");
  }

  if (endTime && new Date(endTime) < new Date(startTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (
    registrationDeadline &&
    new Date(registrationDeadline) > new Date(startTime)
  ) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  const parsedTargets = JSON.parse(targets);

  for (const t of parsedTargets) {
    if (t.school) {
      t.school = await validateSchool(t.school);
    } else {
      if (t.branches?.length) {
        throw new ApiError(
          400,
          "Cannot select branch without selecting school",
        );
      }
      continue;
    }

    for (const b of t.branches || []) {
      if (!b.branch) {
        throw new ApiError(400, "Branch is required if selected");
      }
      b.branch = await validateBranch(b.branch, t.school);

      if (b.StudentYear != null) {
        if (!t.school || !b.branch) {
          throw new ApiError(
            400,
            "Cannot select year without selecting school and branch",
          );
        }
        if (b.StudentYear < 1 || b.StudentYear > 5) {
          throw new ApiError(400, "Invalid StudentYear");
        }
      }

      if (b.divisions?.length) {
        if (!t.school || !b.branch || b.StudentYear == null) {
          throw new ApiError(
            400,
            "Cannot select divisions without selecting school, branch, and year",
          );
        }

        let divisionIds = [];
        for (let k = 0; k < b.divisions.length; k++) {
          const divisionId = await validateDivision(b.divisions[k], b.branch);
          divisionIds.push(divisionId);
        }
        b.divisions = divisionIds;
      }
    }
  }

  const year = new Date(startTime).getFullYear();

  const existing = await Event.findOne({ name, year });

  if (existing) {
    throw new ApiError(400, `Event "${name}" already exists for year ${year}`);
  }

  let { level, status } = await determineEventLevel(parsedTargets);

  if (
    req.user.role === "Dean" &&
    ["School", "Division", "Branch"].includes(level)
  ) {
    status = "Approved";
  }

  const uploadedEps = await uploadToCloudinary(epsFile, "events/eps");

  let uploadedPhoto = null;
  if (photo) {
    uploadedPhoto = await uploadToCloudinary(photo, "events/photo");
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || null,
    eps: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
    level,
    year,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
}); // complete

// Director

const createEventDirector = asyncHandler(async (req, res) => {
  if (req.user.role !== "Director") {
    throw new ApiError(404, "Unauthorized error");
  }

  const {
    name,
    detail,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount,
    targets,
  } = req.body;

  const epsFile = req.files?.epsFile[0];
  const photo = req.files?.photo[0];

  if (!name || !detail || !startTime || !venue || !targets || !epsFile) {
    throw new ApiError(400, "Missing required fields");
  }

  if (endTime && new Date(endTime) < new Date(startTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (
    registrationDeadline &&
    new Date(registrationDeadline) > new Date(startTime)
  ) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  const parsedTargets = JSON.parse(targets);

  for (const t of parsedTargets) {
    if (t.school) {
      t.school = await validateSchool(t.school);
    } else {
      if (t.branches?.length) {
        throw new ApiError(
          400,
          "Cannot select branch without selecting school",
        );
      }
      continue;
    }

    for (const b of t.branches || []) {
      if (!b.branch) {
        throw new ApiError(400, "Branch is required if selected");
      }
      b.branch = await validateBranch(b.branch, t.school);

      if (b.StudentYear != null) {
        if (!t.school || !b.branch) {
          throw new ApiError(
            400,
            "Cannot select year without selecting school and branch",
          );
        }
        if (b.StudentYear < 1 || b.StudentYear > 5) {
          throw new ApiError(400, "Invalid StudentYear");
        }
      }

      if (b.divisions?.length) {
        if (!t.school || !b.branch || b.StudentYear == null) {
          throw new ApiError(
            400,
            "Cannot select divisions without selecting school, branch, and year",
          );
        }

        let divisionIds = [];
        for (let k = 0; k < b.divisions.length; k++) {
          const divisionId = await validateDivision(b.divisions[k], b.branch);
          divisionIds.push(divisionId);
        }
        b.divisions = divisionIds;
      }
    }
  }

  const year = new Date(startTime).getFullYear();

  const existing = await Event.findOne({ name, year });

  if (existing) {
    throw new ApiError(400, `Event "${name}" already exists for year ${year}`);
  }

  let { level, status } = await determineEventLevel(parsedTargets);

  const uploadedEps = await uploadToCloudinary(epsFile, "events/eps");

  let uploadedPhoto = null;
  if (photo) {
    uploadedPhoto = await uploadToCloudinary(photo, "events/photo");
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || null,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status: "Approved",
    level,
    year,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
}); // complete

// Club

const createEventClub = asyncHandler(async (req, res) => {
  if (req.user.role !== "Club") {
    throw new ApiError(404, "Unauthorized error");
  }

  const {
    name,
    detail,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount,
    targets,
  } = req.body;

  const epsFile = req.files?.epsFile[0];
  const photo = req.files?.photo[0];

  if (!name || !detail || !startTime || !venue || !targets || !epsFile) {
    throw new ApiError(400, "Missing required fields");
  }

  if (endTime && new Date(endTime) < new Date(startTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (
    registrationDeadline &&
    new Date(registrationDeadline) > new Date(startTime)
  ) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  const parsedTargets = JSON.parse(targets);

  for (const t of parsedTargets) {
    if (t.school) {
      t.school = await validateSchool(t.school);
    } else {
      if (t.branches?.length) {
        throw new ApiError(
          400,
          "Cannot select branch without selecting school",
        );
      }
      continue;
    }

    for (const b of t.branches || []) {
      if (!b.branch) {
        throw new ApiError(400, "Branch is required if selected");
      }
      b.branch = await validateBranch(b.branch, t.school);

      if (b.StudentYear != null) {
        if (!t.school || !b.branch) {
          throw new ApiError(
            400,
            "Cannot select year without selecting school and branch",
          );
        }
        if (b.StudentYear < 1 || b.StudentYear > 5) {
          throw new ApiError(400, "Invalid StudentYear");
        }
      }

      if (b.divisions?.length) {
        if (!t.school || !b.branch || b.StudentYear == null) {
          throw new ApiError(
            400,
            "Cannot select divisions without selecting school, branch, and year",
          );
        }

        let divisionIds = [];
        for (let k = 0; k < b.divisions.length; k++) {
          const divisionId = await validateDivision(b.divisions[k], b.branch);
          divisionIds.push(divisionId);
        }
        b.divisions = divisionIds;
      }
    }
  }

  const year = new Date(startTime).getFullYear();

  const existing = await Event.findOne({ name, year });

  if (existing) {
    throw new ApiError(400, `Event "${name}" already exists for year ${year}`);
  }

  let { level, status } = await determineEventLevel(parsedTargets);

  if (level === "Division") {
    throw new ApiError(404, "Club can not create division level event");
  }

  const uploadedEps = await uploadToCloudinary(epsFile, "events/eps");

  let uploadedPhoto = null;
  if (photo) {
    uploadedPhoto = await uploadToCloudinary(photo, "events/photo");
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || null,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status: "Pending",
    level,
    year,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
}); // complete

export {
  getDivisionCount,
  determineEventLevel,
  createEventFaculty,
  createEventHoD,
  createEventDean,
  createEventDirector,
  createEventClub,
};
