#!/usr/bin/env node

import { program } from "commander";
import csv from "csvtojson";
import dotenv from "dotenv";
import fs from "fs-extra";
import Handlebars from "handlebars";
import inquirer from "inquirer";
import nodemailer from "nodemailer";
import smtpTransport from "nodemailer-smtp-transport";
import type Mail from "nodemailer/lib/mailer";
import { z } from "zod";
dotenv.config();
const { env } = process;

// Parse the command line arguments
let { dev, templateDir, template, file, email, password } = program
	.option("-v, --dev", "Run in development mode")
	.option("-d, --template-dir <templateDir>", "The path to the templates directory")
	.option("-t, --template <template>", "The template to send")
	.option("-f, --file <file>", "The CSV file to read")
	.option("-e, --email <email>", "The email address to send from")
	.option("-p, --password <password>", "The password to use")
	.parse()
	.opts();
dev ??= env.NODE_ENV === "development";

// Ask for the template directory
templateDir ??= (
	await inquirer.prompt<{ templateDir: string }>({
		name: "templateDir",
		type: "input",
		message: "Enter the path to the templates directory",
		default: "templates",
	})
)?.templateDir;
// Validate the template directory
if (!templateDir || !(await fs.pathExists(templateDir))) {
	throw new Error("Please specify the templates directory");
}

// Ask for the template
const choices = await fs.readdir(templateDir);
template ??= (
	await inquirer.prompt<{ template: string }>({
		name: "template",
		type: "list",
		message: "Which templates directory do you want to use?",
		choices,
	})
)?.template;
// Validate the template
if (!template || !choices.includes(template)) {
	throw new Error("Please specify the template to send");
}

// Ask for the CSV file
file ??= (
	await inquirer.prompt<{ file: string }>({
		name: "file",
		type: "input",
		message: "Enter the path to a CSV file with name, email, and language columns",
		default: "emails.csv",
	})
)?.file;
// Validate the CSV file
if (!file || !(await fs.pathExists(file)) || !z.string().endsWith(".csv").safeParse(file).success) {
	throw new Error("Please specify a CSV file to read");
}

// Ask for the email address
email ??= (
	await inquirer.prompt<{ email: string }>({
		name: "email",
		type: "input",
		message: "Enter the email address to send from",
		default: env.GMAIL_USER,
	})
)?.email;
// Validate the email address
if (!email || !z.string().email().safeParse(email).success) {
	throw new Error("Please specify an email address to send from");
}

// Ask for the password
password ??= (
	await inquirer.prompt<{ password: string }>({
		name: "password",
		type: "password",
		message: "Enter the password to use",
		default: env.GMAIL_PASSWORD,
	})
)?.password;
// Validate the password
if (!password || !z.string().min(1).safeParse(password).success) {
	throw new Error("Please specify a password to use");
}

// Compile the templates
const templates: Record<"text" | "html", Handlebars.TemplateDelegate> = {} as any;
try {
	templates.text = Handlebars.compile(await fs.readFile(`${templateDir}/${template}/text.hbs`, "utf8"));
	templates.html = Handlebars.compile(await fs.readFile(`${templateDir}/${template}/html.hbs`, "utf8"));
} catch (err) {
	throw new Error(`Failed to compile the templates: ${err}`);
}

// Get the language data
let languageData: Record<string, any>;
try {
	languageData = await fs.readJSON(`${templateDir}/${template}/language.json`);
} catch (err) {
	throw new Error(`Failed to read the language data: ${err}`);
}

// Create a parser
const csvParser = csv({
	headers: ["name", "email", "language"],
	trim: true,
});

// Open a file stream
fs.createReadStream(file).pipe(csvParser);

// Transform the stream
const emails: Mail.Options[] = [];
csvParser.subscribe(row => {
	// Parse the row
	const schema = z
		.object({
			name: z.string().min(1),
			email: z.string().email(),
			language: z.union([z.literal("en"), z.literal("fr")]),
		})
		.safeParse(row);

	if (!schema.success) {
		console.error(schema.error);
		return;
	}

	const { name, email, language } = schema.data;

	const data = { ...languageData[language], name, email };

	// Add the email to the queue
	emails.push({
		to: email,
		subject: languageData[language].subject,
		text: templates.text(data).replace(/<\/?[^>]+(>|$)/g, ""),
		html: templates.html(data),
		list: {
			...(languageData[language].meta ?? {}),
			unsubscribe: {
				...(languageData[language].meta?.unsubscribe ?? {}),
				url: languageData[language].meta?.unsubscribe?.url?.replace("{{email}}", email) ?? "",
			},
		},
	} as Mail.Options);
});

// Wait for the stream to finish
await csvParser;

// Create a SMTP transport object
const transport = nodemailer.createTransport(
	smtpTransport({
		service: "gmail",
		auth: {
			user: email,
			pass: password,
		},
		logger: dev,
		debug: dev,
		pool: {
			pool: true,
		},
	}),
	{
		from: `${languageData.en.from} <${email}>`,
	}
);

// Verify the connection configuration
try {
	await transport.verify();
	console.info("Server is ready to take our messages");
} catch (err) {
	console.error(err);
}

// Send the emails
console.info("Sending emails...");
for (const email of emails) {
	const result = await transport.sendMail(email);
	console.info("Message sent:", result.messageId, result.envelope);
}

// Close the connection pool
transport.close();
