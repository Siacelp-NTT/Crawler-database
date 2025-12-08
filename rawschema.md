
Database Schema
# Table: job
Table: job_posting
This is the central table in the schema, containing detailed information about each individual job advertisement collected.
Field Name
Data Type
Description
Constraints & Options
### job_id
uuid
A unique identifier for each job posting within the internal system. This serves as the Primary Key.  This may compose of the job_title and company and posted time to create a unique id to identify in the system
Must be unique. Not null.
### company_id
uuid
A foreign key that links to the company_id in the company table, associating the job posting with a specific company.
Must correspond to an existing company_id in the company table. 
### job_title
string
The title of the job as listed in the posting (e.g., "Software Engineer," "Marketing Manager"). This title would be raw - unchanged.
### description
string
The full text of the job description, including responsibilities, qualifications, and other details.
### salary
int
The numerical value of the salary offered. This should be stored as an integer for easier calculations and comparisons.
### pay_period
string
The frequency of the salary payment.
Options: hourly, monthly, yearly
### work_type
string
The nature of employment.
Options: Fulltime, Parttime, Contract, Season
### experience_level
string
The required level of experience for the role.
Options: Intern, Fresher, Junior, Senior, Executive
### location
string
The geographical location of the job.
### applies
int
The number of applications received for the job, if this data is available from the source.
### listed_time
datetime
The date and time when the job posting was originally published on the source platform.
### currency
string
The currency in which the salary is specified (e.g., "USD", "VND").
### platform
string
The name of the website where the job posting was found (e.g., "LinkedIn", "Indeed").
### url
string
The direct URL to the original job posting.
Should be a valid URL format.
### crawled_time
datetime
A timestamp indicating when the crawler collected this data.
Not null. Automatically generated at the time of insertion.


# Table: company
Table: company
This table stores information about the companies that have posted job openings. It is designed to avoid data redundancy, so a single company record can be linked to multiple job postings.
Field Name
Data Type
## Description
Constraints & Options
### company_id
uuid
A unique identifier for each company within the internal system. This serves as the Primary Key.
Must be unique. Not null.
### company_name
string
The legal name of the company.
### location
string
The location of the company's headquarters or the specific office that is hiring.
### description
string
A brief description of the company, its mission, or its industry.
### url
string
The URL to the company's official website or careers page.
Should be a valid URL format.
# Table:benefit
Table: benefit
This table catalogs the various benefits offered with a job posting. Each job can have multiple associated benefits.
Field Name
Data Type
## Description
Constraints & Options
### job_id
uuid
A foreign key that links to the job_id in the job_posting table, indicating which job this benefit applies to.
Must correspond to an existing job_id in the job_posting table. Not null.
### type
string
The specific type of benefit being offered. This could be a predefined value from the job posting.
Examples: Healthy Insurance, Paid Time Off, Work From Home, Training Programs, ...
inferred
string
A field to store benefits that are not explicitly listed but are inferred from the job description by a model (like an LLM).


