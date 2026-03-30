import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.js";
import { Event } from "../models/event.js";
import { Branch } from "../models/branch.js";
import { School } from "../models/school.js";
import { Division } from "../models/division.js";
import { registerEmail, sendEmail } from "../utils/mail.js";

// admin funtionality

const createUser = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(403, "Unauthorized user");
  }

  const { fullname, email, role, roll_number, division, school, branch } =
    req.body;

  const password = process.env.temp_password;

  if (!fullname || !email || !role) {
    throw new ApiError(400, "Missing required fields");
  }

  if (school) {
    const s = await School.findById(school);
    if (!s || s.isDeleted) throw new ApiError(400, "Invalid school");
  }

  if (branch) {
    const b = await Branch.findById(branch);
    if (!b || b.isDeleted) throw new ApiError(400, "Invalid branch");
  }

  if (division) {
    const d = await Division.findById(division);
    if (!d || d.isDeleted) throw new ApiError(400, "Invalid division");
  }

  if (role === "Student") {
    if (!roll_number || !division || !school || !branch) {
      throw new ApiError(
        400,
        "roll_number, division, school and branch required",
      );
    }
  }

  if (role === "HoD" && !branch) {
    throw new ApiError(400, "Branch required for HoD");
  }

  if (role === "Dean" && !school) {
    throw new ApiError(400, "School required for Dean");
  }

  let user = await User.findOne({ email });

  if (user) {
    if (user.status === "deleted") {
      user.fullname = fullname;
      user.role = role;
      user.password = password;
      user.status = "inactive";
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

  res.status(201).json(new ApiResponse(201, user, "User created successfully"));
});

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
});

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
});

const modifyUser = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(403, "Unauthorized user");
  }

  const { email, ...updates } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const allowedFields = [
    "fullname",
    "role",
    "roll_number",
    "division",
    "school",
    "branch",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  if (updates.school !== undefined) {
    const s = await School.findById(updates.school);
    if (!s || s.isDeleted) {
      throw new ApiError(400, "Invalid school");
    }
  }

  if (updates.branch !== undefined) {
    const b = await Branch.findById(updates.branch);
    if (!b || b.isDeleted) {
      throw new ApiError(400, "Invalid branch");
    }
  }

  if (updates.division !== undefined) {
    const d = await Division.findById(updates.division);
    if (!d || d.isDeleted) {
      throw new ApiError(400, "Invalid division");
    }
  }

  for (const key of Object.keys(updates)) {
    user[key] = updates[key];
  }

  if (updates.role) {
    const role = updates.role;

    if (role !== "Student") {
      user.roll_number = undefined;
      user.division = undefined;
    }

    if (role !== "Student" && role !== "HoD") {
      user.branch = undefined;
    }

    if (role !== "Student" && role !== "Dean") {
      user.school = undefined;
    }
  }

  if (user.role === "Student") {
    if (!user.roll_number || !user.division || !user.school || !user.branch) {
      throw new ApiError(
        400,
        "Student requires roll_number, division, school and branch",
      );
    }
  }

  if (user.role === "HoD" && !user.branch) {
    throw new ApiError(400, "HoD requires branch");
  }

  if (user.role === "Dean" && !user.school) {
    throw new ApiError(400, "Dean requires school");
  }

  await user.save();

  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
});

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
});

const modifyEvent = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") {
    throw new ApiError(404, "Unauthorized user");
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
    "photo",
    "epsFile",
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

  const newStart = updates.startTime || event.startTime;
  const newEnd = updates.endTime || event.endTime;
  const newDeadline =
    updates.registrationDeadline || event.registrationDeadline;

  if (newEnd && newEnd < newStart) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (newDeadline && newDeadline > newStart) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  if (updates.amount !== undefined && updates.amount < 0) {
    throw new ApiError(400, "Amount cannot be negative");
  }

  for (const key of Object.keys(updates)) {
    event[key] = updates[key];
  }

  await event.save();

  res
    .status(200)
    .json(new ApiResponse(200, event, "Event updated successfully"));
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

export {
  createUser,
  eventStatusApprove,
  eventStatusReject,
  modifyUser,
  deleteUser,
  modifyEvent,
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
