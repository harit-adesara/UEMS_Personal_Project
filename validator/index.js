import body from "express-validator";

const roleRequirements = {
  Student: ["roll_number", "division", "school", "branch", "year"],
  HoD: ["branch"],
  Dean: ["school"],
  Director: [],
  External: [],
  Admin: [],
};

const register = () => {
  return [
    body("password")
      .trim()
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 3, max: 12 }),
  ];
};

const login = () => {
  return [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("password")
      .trim()
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 3, max: 12 }),
  ];
};

const createUserValidator = () => {
  return [
    body("fullname")
      .notEmpty()
      .withMessage("Fullname is required")
      .isString()
      .trim()
      .withMessage("Fullname must be a string"),

    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email address"),

    body("role")
      .notEmpty()
      .withMessage("Role is required")
      .isIn([
        "Student",
        "HoD",
        "Dean",
        "Faculty",
        "Director",
        "Club",
        "External",
      ])
      .withMessage("Invalid role"),

    body("roll_number")
      .if(body("role").equals("Student"))
      .notEmpty()
      .withMessage("roll_number is required for Student")
      .isString()
      .trim()
      .withMessage("roll_number must be string"),

    body("division")
      .if(body("role").equals("Student"))
      .notEmpty()
      .withMessage("division is required for Student")
      .isString()
      .trim()
      .withMessage("division must be string"),

    body("school")
      .if(
        (value, { req }) =>
          req.body.role === "Student" || req.body.role === "Dean",
      )
      .notEmpty()
      .withMessage("school is required for Student or Dean")
      .isString()
      .trim()
      .withMessage("school must be string"),

    body("branch")
      .if(
        (value, { req }) =>
          req.body.role === "Student" || req.body.role === "HoD",
      )
      .notEmpty()
      .withMessage("branch is required for Student or HoD")
      .isString()
      .trim()
      .withMessage("branch must be string"),

    body("year")
      .if(body("role").equals("Student"))
      .notEmpty()
      .withMessage("year is required for Student")
      .isInt({ min: 1, max: 5 })
      .trim()
      .withMessage("year must be an integer between 1 and 5"),
  ];
};

const modifyUserValidator = () => {
  return [
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email"),

    body("fullname")
      .optional()
      .isString()
      .withMessage("Fullname must be a string"),

    body("role")
      .optional()
      .isIn(["Student", "HoD", "Dean", "Faculty", "Director", "Club"])
      .withMessage("Invalid role"),

    body("roll_number")
      .optional()
      .if((value, { req }) => (req.body.role || req.user.role) === "Student")
      .notEmpty()
      .withMessage("roll_number is required for Student")
      .isString()
      .withMessage("roll_number must be string"),

    body("year")
      .optional()
      .if((value, { req }) => (req.body.role || req.user.role) === "Student")
      .notEmpty()
      .withMessage("year is required for Student")
      .isInt({ min: 1, max: 5 })
      .withMessage("year must be integer between 1 and 5"),

    body("school")
      .optional()
      .if((value, { req }) =>
        ["Student", "Dean"].includes(req.body.role || req.user.role),
      )
      .notEmpty()
      .withMessage("school is required for Student or Dean")
      .isString()
      .withMessage("school must be string"),

    body("branch")
      .optional()
      .if((value, { req }) =>
        ["Student", "HoD"].includes(req.body.role || req.user.role),
      )
      .notEmpty()
      .withMessage("branch is required for Student or HoD")
      .isString()
      .withMessage("branch must be string"),

    body("division")
      .optional()
      .if((value, { req }) => (req.body.role || req.user.role) === "Student")
      .notEmpty()
      .withMessage("division is required for Student")
      .isString()
      .withMessage("division must be string"),
  ];
};

const modifyEventValidator = () => {
  return [
    body("eventId")
      .notEmpty()
      .withMessage("Event ID is required")
      .isMongoId()
      .withMessage("Invalid Event ID"),

    body("name")
      .optional()
      .isString()
      .withMessage("Event name must be a string"),

    body("detail").optional().isString().withMessage("Detail must be a string"),

    body("targets")
      .optional()
      .custom((value) => {
        try {
          JSON.parse(value);
          return true;
        } catch {
          throw new Error("Targets must be valid JSON");
        }
      }),

    body("startTime")
      .optional()
      .isISO8601()
      .withMessage("startTime must be a valid date"),

    body("endTime")
      .optional()
      .isISO8601()
      .withMessage("endTime must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) < new Date(req.body.startTime)
        ) {
          throw new Error("End time must be after start time");
        }
        return true;
      }),

    body("registrationDeadline")
      .optional()
      .isISO8601()
      .withMessage("registrationDeadline must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) > new Date(req.body.startTime)
        ) {
          throw new Error("Registration deadline must be before start time");
        }
        return true;
      }),

    body("venue").optional().isString().withMessage("Venue must be a string"),

    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a non-negative number"),

    body().custom((value) => {
      const restrictedFields = ["status", "approvalHistory", "organizedBy"];
      for (const key of restrictedFields) {
        if (key in value) {
          throw new Error(`${key} cannot be updated`);
        }
      }
      return true;
    }),
  ];
};

const createEventValidator = () => {
  return [
    body("name")
      .notEmpty()
      .withMessage("Event name is required")
      .isString()
      .withMessage("Event name must be a string"),

    body("detail")
      .notEmpty()
      .withMessage("Event detail is required")
      .isString()
      .withMessage("Event detail must be a string"),

    body("startTime")
      .notEmpty()
      .withMessage("startTime is required")
      .isISO8601()
      .toDate()
      .withMessage("startTime must be a valid date"),

    body("endTime")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("endTime must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) < new Date(req.body.startTime)
        ) {
          throw new Error("End time must be after start time");
        }
        return true;
      }),

    body("registrationDeadline")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("registrationDeadline must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) > new Date(req.body.startTime)
        ) {
          throw new Error("Registration deadline must be before start time");
        }
        return true;
      }),

    body("venue")
      .notEmpty()
      .withMessage("Venue is required")
      .isString()
      .withMessage("Venue must be a string"),

    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a non-negative number"),

    body("targets")
      .notEmpty()
      .withMessage("Targets are required")
      .custom((value) => {
        try {
          JSON.parse(value);
          return true;
        } catch (err) {
          throw new Error("Targets must be valid JSON");
        }
      }),

    body("epsFile").custom((value, { req }) => {
      if (!req.files || !req.files.epsFile) {
        throw new Error("EPS file is required");
      }
      return true;
    }),

    body("photo")
      .optional()
      .custom((value, { req }) => {
        return true;
      }),
  ];
};

const modifyEventBeforeApproveValidator = () => {
  return [
    body("name")
      .optional()
      .isString()
      .trim()
      .withMessage("Name must be a string"),

    body("detail")
      .optional()
      .isString()
      .trim()
      .withMessage("Detail must be a string"),

    body("startTime")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("startTime must be a valid date"),

    body("endTime")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("endTime must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) < new Date(req.body.startTime)
        ) {
          throw new Error("End time must be after start time");
        }
        return true;
      }),

    body("registrationDeadline")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("registrationDeadline must be a valid date")
      .custom((value, { req }) => {
        const start = req.body.startTime ? new Date(req.body.startTime) : null;
        if (value && start && new Date(value) > start) {
          throw new Error("Registration deadline must be before start time");
        }
        return true;
      }),

    body("venue")
      .optional()
      .isString()
      .trim()
      .withMessage("Venue must be a string"),

    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be non-negative"),

    body("targets")
      .optional()
      .custom((value) => {
        let parsed;
        try {
          parsed = typeof value === "string" ? JSON.parse(value) : value;
        } catch {
          throw new Error("Targets must be valid JSON");
        }

        if (!Array.isArray(parsed)) throw new Error("Targets must be an array");

        parsed.forEach((t) => {
          if (!t.school) throw new Error("Each target must have a school");
          if (!Array.isArray(t.branches))
            throw new Error("Branches must be an array");

          t.branches.forEach((b) => {
            if (
              b.StudentYear != null &&
              (b.StudentYear < 1 || b.StudentYear > 5)
            )
              throw new Error("StudentYear must be between 1 and 5");

            if (!b.branch && b.StudentYear != null)
              throw new Error(
                "Branch is required when StudentYear is provided",
              );

            if (b.divisions && !Array.isArray(b.divisions))
              throw new Error("Divisions must be an array");
          });
        });

        return true;
      }),
  ];
};

const modifyEventAfterApproveValidator = () => {
  return [
    body("detail")
      .optional()
      .isString()
      .trim()
      .withMessage("Detail must be a string"),

    body("startTime")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("startTime must be a valid date"),

    body("endTime")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("endTime must be a valid date")
      .custom((value, { req }) => {
        if (
          req.body.startTime &&
          new Date(value) < new Date(req.body.startTime)
        ) {
          throw new Error("End time must be after start time");
        }
        return true;
      }),

    body("registrationDeadline")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("registrationDeadline must be a valid date")
      .custom((value, { req }) => {
        const start = req.body.startTime ? new Date(req.body.startTime) : null;
        if (value && start && new Date(value) > start) {
          throw new Error("Registration deadline must be before start time");
        }
        return true;
      }),

    body("venue")
      .optional()
      .isString()
      .trim()
      .withMessage("Venue must be a string"),
  ];
};
