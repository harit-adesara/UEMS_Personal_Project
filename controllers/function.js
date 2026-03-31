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

const validateSchool = async (schoolId) => {
  const school = await School.findById(schoolId);
  if (!school || school.isDeleted) {
    throw new ApiError(400, "Invalid school");
  }
  return school;
};

const validateBranch = async (branchId, schoolId = null) => {
  const branch = await Branch.findById(branchId);

  if (!branch || branch.isDeleted) {
    throw new ApiError(400, "Invalid branch");
  }

  if (schoolId && branch.school.toString() !== schoolId) {
    throw new ApiError(400, "Branch does not belong to given school");
  }

  return branch;
};

const validateDivision = async (divisionId, branchId = null) => {
  const division = await Division.findById(divisionId);

  if (!division || division.isDeleted) {
    throw new ApiError(400, "Invalid division");
  }

  if (branchId && division.branch.toString() !== branchId) {
    throw new ApiError(400, "Division does not belong to given branch");
  }

  return division;
};

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

  if (school) await validateSchool(school);
  if (branch) await validateBranch(branch, school);
  if (division) await validateDivision(division, branch);

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

const getEvent = asyncHandler(async (req, res) => {
  try {
    if (req.user.role === "Admin") {
      let filter = {
        startTime: { $gte: new Date() },
      };
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.organizedBy) {
        filter.organizedBy = req.query.organizedBy;
      }
      if (req.query.name) {
        filter.name = req.query.name;
      }

      const events = await Event.find(filter).sort({ date: 1 });
      if (events.length === 0) {
        throw new ApiError(404, "Events not found");
      }
      return res.status(200).json(new ApiResponse(200, events));
    }
  } catch (error) {
    throw new ApiError(404, "Event not found");
  }
});

const getUser = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    res
      .status(200)
      .json(new ApiResponse(200, { user }, "User fetched successfully"));
  } catch (error) {
    throw new ApiError(404, "Erro while fetching user");
  }
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
  if (!email) throw new ApiError(400, "Email is required to identify user");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  const allowedFields = [
    "fullname",
    "role",
    "roll_number",
    "school",
    "branch",
    "division",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Invalid field: ${key}`);
    }
  }

  if (updates.school) await validateSchool(updates.school);
  if (updates.branch)
    await validateBranch(updates.branch, updates.school || user.school);
  if (updates.division)
    await validateDivision(updates.division, updates.branch || user.branch);

  for (const key of Object.keys(updates)) {
    user[key] = updates[key];
  }

  const role = updates.role || user.role;

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

  if (role === "Student") {
    if (!user.roll_number || !user.division || !user.school || !user.branch) {
      throw new ApiError(
        400,
        "Student requires roll_number, division, school, and branch",
      );
    }
  }
  if (role === "HoD" && !user.branch)
    throw new ApiError(400, "HoD requires branch");
  if (role === "Dean" && !user.school)
    throw new ApiError(400, "Dean requires school");

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
  return await Division.countDocuments({ branch: branchId });
};

const isDivisionLevelEvent = async (parsedTargets) => {
  if (parsedTargets.length !== 1) return false;

  const school = parsedTargets[0];

  if (!school.branches || school.branches.length !== 1) return false;

  const branchObj = school.branches[0];
  const { branch, divisions } = branchObj;

  if (!divisions || divisions.length === 0) return false;

  const totalCount = await getDivisionCount(branch);

  return divisions.length < totalCount;
};

const createEventFaculty = asyncHandler(async (req, res) => {
  if (req.user.role !== "Faculty") {
    throw new ApiError(403, "Only faculty can create events");
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

  const epsFile = req.files?.epsFile;
  const photo = req.files?.photo;

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
    await validateSchool(t.school);

    for (const b of t.branches) {
      await validateBranch(b.branch, t.school);

      if (b.divisions?.length) {
        for (const d of b.divisions) {
          await validateDivision(d, b.branch);
        }
      }
    }
  }

  const isDivisionLevel = await isDivisionLevelEvent(parsedTargets);
  const status = isDivisionLevel ? "Approved" : "Pending";

  const uploadedEps = await uploadToCloudinaryBuffer(
    epsFile.buffer,
    "events/eps",
  );

  let uploadedPhoto;
  if (photo) {
    uploadedPhoto = await uploadToCloudinaryBuffer(
      photo.buffer,
      "events/photo",
    );
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || undefined,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
});

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

  const epsFile = req.files?.epsFile;
  const photo = req.files?.photo;

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
    await validateSchool(t.school);

    for (const b of t.branches) {
      await validateBranch(b.branch, t.school);

      if (b.divisions?.length) {
        for (const d of b.divisions) {
          await validateDivision(d, b.branch);
        }
      }
    }
  }

  const isBranchLevel = () => {
    if (parsedTargets.length !== 1) {
      return false;
    }
    const school = parsedTargets[0];
    if (!school.branches || school.branches.length > 1) {
      return false;
    }
    return true;
  };

  const status = isBranchLevel() ? "Approved" : "Pending";

  const uploadedEps = await uploadToCloudinaryBuffer(
    epsFile.buffer,
    "events/eps",
  );

  let uploadedPhoto;
  if (photo) {
    uploadedPhoto = await uploadToCloudinaryBuffer(
      photo.buffer,
      "events/photo",
    );
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || undefined,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
});

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

  const epsFile = req.files?.epsFile;
  const photo = req.files?.photo;

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
    await validateSchool(t.school);

    for (const b of t.branches) {
      await validateBranch(b.branch, t.school);

      if (b.divisions?.length) {
        for (const d of b.divisions) {
          await validateDivision(d, b.branch);
        }
      }
    }
  }

  const isSchoolLevel = () => {
    if (parsedTargets.length !== 1) {
      return false;
    }
    return true;
  };

  const status = isSchoolLevel() ? "Approved" : "Pending";

  const uploadedEps = await uploadToCloudinaryBuffer(
    epsFile.buffer,
    "events/eps",
  );

  let uploadedPhoto;
  if (photo) {
    uploadedPhoto = await uploadToCloudinaryBuffer(
      photo.buffer,
      "events/photo",
    );
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || undefined,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status,
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
});

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

  const epsFile = req.files?.epsFile;
  const photo = req.files?.photo;

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
    await validateSchool(t.school);

    for (const b of t.branches) {
      await validateBranch(b.branch, t.school);

      if (b.divisions?.length) {
        for (const d of b.divisions) {
          await validateDivision(d, b.branch);
        }
      }
    }
  }

  const uploadedEps = await uploadToCloudinaryBuffer(
    epsFile.buffer,
    "events/eps",
  );

  let uploadedPhoto;
  if (photo) {
    uploadedPhoto = await uploadToCloudinaryBuffer(
      photo.buffer,
      "events/photo",
    );
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || undefined,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status: "Approved",
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
});

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

  const epsFile = req.files?.epsFile;
  const photo = req.files?.photo;

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
    for (const b of t.branches) {
      if (b.divisions && b.divisions.length > 0) {
        throw new ApiError(
          400,
          "Club cannot create event for specific divisions",
        );
      }
    }
  }

  const uploadedEps = await uploadToCloudinaryBuffer(
    epsFile.buffer,
    "events/eps",
  );

  let uploadedPhoto;
  if (photo) {
    uploadedPhoto = await uploadToCloudinaryBuffer(
      photo.buffer,
      "events/photo",
    );
  }

  const event = await Event.create({
    name,
    detail,
    photo: uploadedPhoto || undefined,
    epsFile: uploadedEps,
    organizedBy: req.user._id,
    targets: parsedTargets,
    startTime,
    endTime,
    registrationDeadline,
    venue,
    amount: amount || 0,
    status: "Pending",
  });

  res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully"));
});

// common
const modifyEventBeforeApproveCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(403, "Unauthorized user");
  }

  const { eventId } = req.params;
  const updates = req.body;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only modify your own event");
  }

  if (event.status !== "Pending") {
    throw new ApiError(400, "Approved events cannot be modified");
  }

  const allowedFields = [
    "name",
    "detail",
    "photo",
    "targets",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
    "amount",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Field '${key}' cannot be updated`);
    }
  }

  for (const key of Object.keys(updates)) {
    event[key] = updates[key];
  }

  if (req.body.file?.photo) {
    event.photo = req.body.file.photo;
  }

  if (req.body.file?.epsFile) {
    event.epsFile = req.body.file.epsFile;
  }

  await event.save();

  res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event modified successfully"));
});

const modifyEventAfterApproveCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(403, "Unauthorized user");
  }

  const { eventId } = req.params;
  const updates = req.body;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only modify your own event");
  }

  if (event.status !== "Approved") {
    throw new ApiError(400, "Rejected events cannot be modified");
  }

  const allowedFields = [
    "detail",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Field '${key}' cannot be updated`);
    }
  }

  for (const key of Object.keys(updates)) {
    event[key] = updates[key];
  }

  await event.save();

  res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event modified successfully"));
});

const deleteEventCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(404, "Unauthorized user");
  }
  const { eventId } = req.params;

  if (!eventId) {
    throw new ApiError(404, "Event ID not present");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(404, "Only owner of this event can delete it");
  }

  if (event.status !== "Pending") {
    throw new ApiError(404, "Only pending event can be deleted");
  }

  const event = await Event.findByIdAndDelete(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  res.status(200).json(new ApiResponse(200, {}, "Event deleted successfully"));
});
