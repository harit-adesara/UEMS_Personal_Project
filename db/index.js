import { connect, mongoose } from "mongoose";

const connectDb = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to DB");
  } catch (error) {
    console.log("Not connected to DB");
    process.exit(1);
  }
};

export { connectDb };
