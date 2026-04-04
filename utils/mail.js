import Mailgen from "mailgen";
import nodemailer from "nodemailer";

const sendEmail = async (option) => {
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "Event Management",
      link: "https://eventManagement.com",
    },
  });
  const emailTextual = mailGenerator.generatePlaintext(option.mailgenContent);
  const emailHtml = mailGenerator.generate(option.mailgenContent);
  const transporter = nodemailer.createTransport({
    host: process.env.GMAIL_HOST,
    port: process.env.GMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
  const mail = {
    from: `"UEMS" <${process.env.GMAIL_USER}>`,
    to: option.email,
    subject: option.subject,
    text: emailTextual,
    html: emailHtml,
  };

  try {
    await transporter.sendMail(mail);
  } catch (error) {
    console.error(
      "Email service failed siliently, Make sure that you have provided your mailtrap credentials in .env file",
    );
    console.error("Email ", error);
  }
};

const registerEmail = (username, passwordSetUrl) => {
  return {
    body: {
      name: username,
      intro: "Set your account password for event management website",
      action: {
        instructions: "To set password click on the following button",
        button: {
          color: "#2fe16a",
          text: "Set password",
          link: passwordSetUrl,
        },
      },
    },
  };
};

const forgotPasswordMailgenContent = (username, passwordResetUrl) => {
  return {
    body: {
      name: username,
      intro: "We got a request to reset password of your current account!",
      action: {
        instructions: "To reset your password click on the following button",
        button: {
          color: "#d92727ff",
          text: "Reset password",
          link: passwordResetUrl,
        },
      },
      outro:
        "Need help, or have questions? just reply to this email, we'd love to help",
    },
  };
};

export { forgotPasswordMailgenContent, sendEmail, registerEmail };
