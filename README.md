# Bulk Gmail

[![Version](https://img.shields.io/npm/v/bulk-gmail?style=flat-square)](https://npmjs.com/package/bulk-gmail) [![Discord Server](https://img.shields.io/badge/-Discord-%232c2f33?style=flat-square&logo=discord)](https://discord.gg/AAkZWWqVav) [![Patreon](https://img.shields.io/badge/-Patreon-%23141518?style=flat-square&logo=patreon)](https://www.patreon.com/bePatron?u=15896855)

This is a CLI tool for sending bulk emails using Gmail.

It was originally created for [Hack the Hill](https://example.com) to send emails to all of the applicants.

Bulk Gmail is a CLI that reads from a CSV file for the lists of recipients and a directory of Handlebars email templates. It then sends emails to the recipients using the email templates.

## Usage

You can send emails using the `npx bulk-gmail` command. The CLI will prompt you for which email template to use, the for a path to the CSV file containing the list of recipients, and your Gmail credentials. The CSV file should have the following columns:

- `id`: The ID of the recipient
- `name`: The name of the recipient
- `email`: The email address of the recipient
- `language`: The language of the recipient (`en` or `fr`)

The chosen email templates directory should contain folders for each template. Inside of those folders, there should be a `text.hbs` file for the text version of the email and a `html.hbs` file for the HTML version of the email. The email templates are written in Handlebars and they are compiled with the language data from the corresponding `language.json` file (in addition to `name` and `email` variables with the recipient's info).

The `language.json` file can also have `from`, `subject`, and `meta` keys. `meta` will be parsed as email List headers.

Here is an example of a `language.json` file:

```jsonc
{
    "en": {
        "from": "Your name",
        "subject": "Subject here",

        // These are optional free-form fields (they can be anything you want) that can be used in the email templates
        "greeting": "Hello",
        "message": [
            "This is a message",
            "It has multiple lines"
        ],
        "signature": "Your signature",
        "closing": "Your name",
        "unsubscribe": "Unsubscribe",

        // These are optional fields that will be parsed as email List headers
        "meta": {
            "help": "admin@example.com?subject=Help with mailing list",
            "unsubscribe": {
                // The `{{email}}` variable will be replaced with the recipient's email address
                "url": "https://example.com/unsubscribe?email={{email}}",
                "comment": "Unsubscribe from further emails"
            },
            "id": {
                "url": "https://example.com",
                "comment": "2023 mailing list"
            }
        }
    },
    "fr": {
        "from": "Votre nom",
        "subject": "Sujet ici",

        // etc.
    }
}
```

Here is an example of a `text.hbs` file:

```handlebars
{{greeting}}, {{name}}!

{{#each message as |paragraph|}}
    {{paragraph}}
{{/each}}

{{signature}}

{{closing}}

{{unsubscribe}}: https://example.com/unsubscribe?email={{email}}
```

Here is an example of a `html.hbs` file:

```handlebars
<p>{{greeting}}, {{name}}!</p>

{{#each message as |paragraph|}}
    <p>{{paragraph}}</p>
{{/each}}

<p>{{signature}}</p>

<p>{{closing}}</p>

<a href="https://example.com/unsubscribe?email={{email}}">{{unsubscribe}}</a>
```

## Support

Please consider supporting me on [my Patreon](https://patreon.com/arcanistzed) if you like my work. You can see a list of all my projects on [my website](https://arcanist.me).

## Bugs

You can submit bugs via [Github Issues](https://github.com/arcanistzed/bulk-gmail/issues/new/choose) or on [my Discord server](https://discord.gg/AAkZWWqVav).

## Contact me

Come hang out on my [my Discord server](https://discord.gg/AAkZWWqVav).

## License

Copyright © 2022 arcanist

This package is under an [MIT license](LICENSE).
