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
let { dev, templateDir, template, file, from, password } = program
	.option("-v, --dev", "Run in development mode")
	.option("-d, --template-dir <templateDir>", "The path to the templates directory")
	.option("-t, --template <template>", "The template to send")
	.option("-c, --file <file>", "The CSV file to read")
	.option("-f, --from <from>", "The email address to send from")
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

// Ask for the email address to send from
from ??= (
	await inquirer.prompt<{ from: string }>({
		name: "from",
		type: "input",
		message: "Enter the email address to send from",
		default: env.GMAIL_USER,
	})
)?.from;
// Validate the email address to send from
if (!from || !z.string().email().safeParse(from).success) {
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
	headers: ["id", "name", "email", "language"],
	trim: true,
});

// Open a file stream
fs.createReadStream(file).pipe(csvParser);

// Transform the stream
const messages: Mail.Options[] = [];
csvParser.subscribe(row => {
	// Parse the row
	const schema = z
		.object({
			id: z.string().min(1),
			name: z.string().min(1),
			email: z.string().email(),
			language: z.union([z.literal("en"), z.literal("fr")]),
		})
		.safeParse(row);

	if (!schema.success) {
		console.error(`Failed to parse CSV row: ${JSON.stringify(row)}`);
		process.exit(-1);
	}

	const { id, name, email, language } = schema.data;

	const data = { ...languageData[language], id, name, email };

	// Add the message to the queue
	messages.push({
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

// Send the messages
console.info("Sending messages...");
let transport: nodemailer.Transporter;
let sent = 0;
for (const message of messages) {
	// Stop sending after 450 messages per 24 hours (Gmail limit)
	if (sent >= 450) {
		console.info("Reached the Gmail limit of 450 messages per 24 hours. Stopping...");
		break;
	}
	await send(message);
	sent++;
}

/**
 * Send a message using Nodemailer through Gmail
 * @param message The email message to send
 */
async function send(message: Mail.Options) {
	let transport: nodemailer.Transporter | null = null;
	try {
		// Create a SMTP transport object
		transport = nodemailer.createTransport(
			smtpTransport({
				service: "gmail",
				auth: {
					user: from,
					pass: password,
				},
				logger: dev,
				debug: dev,
				pool: {
					pool: true,
				},
			}),
			{
				from: `${languageData.en.from} <${from}>`,
			}
		);

		// Verify the connection configuration
		try {
			await transport.verify();
			console.info("Server is ready to take our messages");
		} catch (error) {
			console.error("Failed to verify server:", error);
			process.exit(-1);
		}

		const result = await transport.sendMail(message);
		console.info("Message sent:", result.messageId, result.envelope);
	} catch (error) {
		console.error("Failed to send message:", error);
		// Wait 60 seconds before retrying
		await new Promise(resolve => setTimeout(resolve, 60 * 1000));
		console.info("Retrying...");
		await send(message);
	} finally {
		// Close the connection pool
		if (transport) {
			transport.close();
		}
	}
}
