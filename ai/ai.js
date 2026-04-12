import { GoogleGenerativeAI } from "@google/generative-ai";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/api_error.js";
import { ApiResponse } from "../utils/api_response.js";
import { Registration } from "../models/registration.js";
import { Event } from "../models/event.js";
import { School } from "../models/school.js";
import { Branch } from "../models/branch.js";
import { Division } from "../models/division.js";
import dotenv, { config } from "dotenv";
dotenv.config({
  path: "./.env",
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function isUEMSRelated(message) {
  const keywords = [
    "event",
    "register",
    "registration",
    "schedule",
    "venue",
    "organizer",
    "deadline",
    "price",
    "free",
    "seminar",
    "workshop",
    "fest",
    "school",
    "branch",
    "division",
    "time",
  ];

  const msg = message.toLowerCase();
  return keywords.some((k) => msg.includes(k));
}
const removeMongoIds = (obj, seen = new WeakSet()) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeMongoIds(item, seen));
  }

  if (obj && typeof obj === "object") {
    if (seen.has(obj)) return obj;
    seen.add(obj);

    const clean = {};

    for (const key in obj) {
      if (key === "_id") continue;
      clean[key] = removeMongoIds(obj[key], seen);
    }

    return clean;
  }

  return obj;
};

const data = async (user, message) => {
  let filter = {};
  let event = "";
  let registration = "";
  let school = await School.find().select("name isDeleted");
  let branch = await Branch.find()
    .populate("school", "name")
    .select("name school isDeleted");
  let division = await Division.find()
    .populate("branch", "name")
    .select("name branch isDeleted");

  if (user.role === "Student") {
    filter.status = "Approved";
    filter.targets = {
      $elemMatch: {
        school,
        branches: {
          $elemMatch: {
            $and: [
              { branch: { $in: [branch, null] } },
              { StudentYear: { $in: [year, null] } },
              {
                $or: [
                  { divisions: { $size: 0 } },
                  { divisions: { $in: [division] } },
                ],
              },
            ],
          },
        },
      },
    };
    event = await Event.find(filter)
      .populate("organizedBy", "name")
      .select(
        "name detail photo organizedBy year startTime endTime registrationDeadline venue amount",
      );

    registration = await Registration.find({ student: req.user })
      .populate("event", "name")
      .populate("student", "name")
      .select("event student");
  } else {
    event = await Event.find(filter)
      .populate("organizedBy", "name")
      .select(
        "name detail photo organizedBy year startTime endTime registrationDeadline venue amount level status",
      );
  }

  const safeEvent = removeMongoIds(event);
  const safeRegistration = removeMongoIds(registration);
  const safeSchool = removeMongoIds(school);
  const safeBranch = removeMongoIds(branch);
  const safeDivision = removeMongoIds(division);

  return `
  USER ROLE: ${user.role}

  USER QUERY:
  ${message}

  EVENT DATA:
  ${JSON.stringify(safeEvent, null, 2)}

  REGISTRTION DATA:
  ${JSON.stringify(safeRegistration, null, 2)}

  SCHOOL IN COLLEGE DATA:
  ${JSON.stringify(safeSchool, null, 2)}

  BRANCH IN COLLEGE DATA:
  ${JSON.stringify(safeBranch, null, 2)}

  DIVISION IN COLLEGE DATA:
  ${JSON.stringify(safeDivision, null, 2)}

  RULES:
- Do not expose any internal IDs
- Use only provided data
- Do not invent events
- Respect role restrictions
`;
};

export const chatBot = asyncHandler(async (req, res) => {
  try {
    const { message } = req.body;
    if (!req.user) {
      throw new ApiError(404, "Unauthorized user");
    }
    const user = req.user;

    if (!isUEMSRelated(message)) {
      return res.end("I can only help with event-related queries.");
    }

    const detail = await data(user, message);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const result = await model.generateContentStream({
      contents: [
        {
          role: "user",
          parts: [{ text: detail }],
        },
      ],
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: `
                  You are UEMS Assistant (University Event Management System).

                  RULES:
                  - Only answer questions related to events, registrations, schedules, venues, deadlines, organizers.
                  - If request is not related to UEMS, reply exactly:
                    "I can only help with event-related queries."
                  - Do not provide coding help, general knowledge, or unrelated topics.
                  - Keep responses short and direct.
                  `,
          },
        ],
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (error) {
    throw new ApiError(404, "Error in chatbot");
  }
});
