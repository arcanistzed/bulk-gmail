# Changelog

## 1.0.3 - 27 Dec 2022 - Initial Release

## 1.0.5 - 18 Jan 2023

Support HTML tags in content

## 1.0.6 - 24 Jan 2023

Retry sending email if failed

## 1.1.0 - 24 Jan 2023

* Improved error handling
* Changed CLI command to use `-c` instead of `-f` for the CSV file and `-f` is now used for the from email address instead of `-e`
* Fixed error handling for retying sending emails to make it login again each time and crash if the SMTP transport cannot be verified
* Added ID column to CSV file

## 1.1.1 - 30 Jan 2023

Fixed errors with transport variable scoping
