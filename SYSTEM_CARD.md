# AI Answers System Card

**Version**: 1.0  
**Date**: January 2025  
**Organization**: Canadian Digital Service (CDS)  
**Contact**: [Contact information to be added]  

## Executive Summary

AI Answers is a specialized AI assistant designed exclusively for Government of Canada websites. It provides accurate, brief answers to user questions about government services, programs, and information, with a single appropriate citation. AI Answers is model-independent, with an innovative evaluation system that uses detailed human expert evaluations to fuel automated AI evaluations and accurate answers. The system is built with privacy, accessibility, and accuracy as core principles.

## Current Status
- **Environment**: Preparing for public pilot
- **Production**: https://ai-answers.alpha.canada.ca (Azure OpenAI + AWS DocumentDB)
- **Staging**: ai-answers.cdssandbox.xyz (OpenAI + MongoDB Atlas)
- **Evaluation**: Ongoing expert feedback collection and response scoring
- **Platform**: Departments can add prompt scenarios to meet specific needs

## System Purpose and Scope

### Primary Function
- Assist users navigating Canada.ca and other government services
- Provide accurate information about Government of Canada programs, benefits, and services
- Direct users to appropriate government resources and next steps

### Target Users
- Canadian citizens and permanent residents
- Temporary residents and visitors to Canada
- Government employees seeking information
- Anyone accessing Canada.ca or gc.ca websites

### Content Scope
- **In Scope**: Government of Canada services, programs, benefits, regulations, and official information
- **Out of Scope**: Provincial/territorial/municipal services, personal advice, non-government topics
- **Sources**: Only Canada.ca, gc.ca, and federal organization domains

### Language Support
- Full bilingual support (English/French)
- Official language compliance
- Users can ask questions in any language, but citations match the page language
- Responds in other languages as needed

## Technical Architecture

### System Components
1. **Frontend**: React-based chat interface using Canada.ca design system
2. **Backend**: Node.js microservices with prompt-chaining architecture
3. **AI Services**: Azure OpenAI GPT models (production)
4. **Database**: AWS DocumentDB (production)
5. **Infrastructure**: AWS ECS with Terraform infrastructure as code

### AI Model Details
- **Production Models**: Azure OpenAI GPT-4 and GPT-4o Mini models
- **Temperature**: 0 (deterministic responses)
- **Prompt Engineering**: Chain-of-thought prompting with structured output
- **Model Independence**: System designed to work with different AI providers

### Agentic Capabilities
- **Tool Usage**: AI can autonomously use specialized tools to enhance responses
- **downloadWebPage Tool**: Critical for accuracy - downloads and reads web pages to verify current information, especially for:
  - New or updated government pages
  - Time-sensitive content (tax year changes, program updates)
  - Pages modified within the last 4 months
  - Unfamiliar URLs not in training data
  - Specific details like numbers, codes, dates, dollar amounts
- **URL Validation**: Automatically checks if citation URLs are active and accessible
- **Context Generation**: Creates new context for follow-up questions when needed
- **Content Verification**: Prioritizes freshly downloaded content over training data

### Data Flow
1. User submits question through chat interface
2. Content filtering and PI redaction applied
3. Context service determines relevant department
4. Search tools gather relevant government content
5. **AI Agentic Behavior**: AI can use specialized tools including:
   - **downloadWebPage tool**: Downloads and reads web pages to verify current information, especially for new/updated URLs or time-sensitive content
   - **URL validation tool**: Checks if citation URLs are active and accessible
   - **Context generation tool**: Generates new context for follow-up questions
6. Answer service generates response with citations
7. Response logged to database with user feedback

## Risk Assessment and Safety Measures

### Potential Harms and Mitigation Strategies

#### **Information Accuracy Risks**
**Potential Harms:**
- Providing outdated or incorrect government information
- Misleading users about eligibility requirements or deadlines
- Giving incomplete information that could affect user decisions

**Mitigation Strategies:**
- **Real-time Content Verification**: downloadWebPage tool downloads and reads current web pages to verify information accuracy
- **Citation Requirements**: Every answer must include a single verified government source link
- **URL Validation**: Automatic checking of citation URLs for validity and accessibility
- **Expert Evaluation System**: Continuous human expert evaluation of response accuracy
- **Content Freshness Monitoring**: Prioritizes freshly downloaded content over potentially outdated training data
- **Department-Specific Scenarios**: Tailored prompts for different government departments to improve accuracy

#### **Privacy and Data Protection Risks**
**Potential Harms:**
- Accidental exposure of personal information
- Logging sensitive user data
- Unauthorized access to user conversations

**Mitigation Strategies:**
- **PI Detection and Redaction**: Automatic redaction of personal information (names, SIN, phone numbers, addresses) before processing
- **User Notification**: Users are warned when PI is detected and asked to rephrase
- **Data Minimization**: Only necessary conversation data is stored
- **Access Controls**: Database access restricted to authorized personnel with role-based permissions
- **Encryption**: All data encrypted at rest and in transit
- **No PI to AI Services**: Personal information is never sent to AI services or logged

#### **Content Safety Risks**
**Potential Harms:**
- Generation of inappropriate or harmful content
- Response to manipulation attempts
- Providing advice outside government scope

**Mitigation Strategies:**
- **Content Filtering**: Blocks profanity, discriminatory language, threats, and manipulation attempts
- **Scope Enforcement**: Strict limitation to Government of Canada information only
- **Rate Limiting**: 3 questions per session to prevent abuse
- **Character Limits**: 750 character limit per question to prevent prompt injection
- **User Warnings**: Clear notifications when inappropriate content is detected
- **Response Length Limits**: Maximum 4 sentences to reduce hallucination risk

#### **Accessibility and Fairness Risks**
**Potential Harms:**
- Excluding users with disabilities
- Language barriers for non-English/French speakers
- Inconsistent service quality across different user groups

**Mitigation Strategies:**
- **Screen Reader Testing**: Usability sessions with screen reader users to identify improvements
- **WCAG 2.1 AA Compliance**: Full accessibility standards implementation
- **Bilingual Support**: Full English/French support with official language compliance
- **Multi-language Input**: Users can ask questions in any language
- **Aria-labels and Live Regions**: Proper accessibility markup for assistive technologies
- **Plain Language**: Responses use clear, simple language matching Canada.ca standards

#### **System Reliability Risks**
**Potential Harms:**
- Service outages affecting user access
- API dependency failures
- Data loss or corruption

**Mitigation Strategies:**
- **Infrastructure Monitoring**: CloudWatch metrics and logging for production environment
- **Automated Backups**: AWS DocumentDB with automated backup systems
- **Failover Planning**: System designed for model independence with multiple AI providers
- **Rate Limiting**: Prevents system overload and abuse
- **Error Handling**: Graceful degradation when services are unavailable

### Bias and Fairness Considerations

#### **Potential Biases**
- **Language Bias**: Potential preference for English over French content
- **Department Bias**: Possible over-representation of certain government departments
- **Content Recency Bias**: Newer government content may be prioritized over established information
- **Geographic Bias**: Focus on federal services may not address regional variations

#### **Mitigation Strategies**
- **Balanced Language Support**: Equal treatment of English and French content with official language compliance
- **Department-Specific Context**: Tailored scenarios for all major government departments
- **Content Verification**: downloadWebPage tool ensures current information regardless of training data age
- **Expert Evaluation**: Human oversight to identify and correct potential biases
- **Transparency**: Clear documentation of system limitations and scope

### Safety and Risk Mitigation

#### **Content Filtering**
- **PI Detection**: Automatic redaction of personal information (names, SIN, phone numbers, addresses)
- **Inappropriate Content**: Blocks profanity, discriminatory language, threats, and manipulation attempts
- **Rate Limiting**: 3 questions per session to prevent abuse
- **Character Limits**: 750 character limit per question

#### **Privacy Protection**
- **PI Protection**: Most personal information is blocked from being sent to AI services or logged
- **User Notification**: Users are warned when PI is detected and asked to rephrase
- **Data Minimization**: Only necessary conversation data is stored
- **Access Controls**: Database access restricted to authorized personnel

#### **Accuracy Measures**
- **Citation Requirements**: Every answer must include a single verified government source link
- **URL Validation**: Automatic checking of citation URLs for validity
- **Content Verification**: Web page downloading for time-sensitive information
- **Expert Feedback**: Continuous evaluation through expert ratings and feedback

## Performance and Evaluation

### Response Quality
- **Length**: Maximum 4 sentences per answer for clarity
- **Style**: Plain language matching Canada.ca standards
- **Accuracy**: Sourced exclusively from government content
- **Helpfulness**: Corrects misunderstandings and provides actionable next steps

### Evaluation Methods
- **Innovative Expert Evaluation System**: 
  - **In-App Evaluation**: Experts evaluate questions within the actual app interface, experiencing the same user experience
  - **Flexible Evaluation**: Experts can enter their own questions or use existing chat IDs to evaluate user conversations
  - **Sentence-Level Scoring**: Each sentence in AI responses is scored individually (100/80/0 points) with detailed explanations
  - **Citation Rating**: Separate scoring for citation accuracy and relevance (25/20/0 points)
  - **Weighted Total Score**: 75% sentence scores + 25% citation score for comprehensive quality assessment
  - **Embedding Generation**: Expert feedback creates embeddings that enable automated AI evaluations for similar questions
  - **Future Enhancement**: These embeddings will soon assist in answering questions quickly and accurately

- **Separate Public User Feedback**: 
  - **Simple Interface**: "Was this helpful?" with Yes/No options for all users
  - **Detailed Follow-up**: Single question asking why they clicked Yes or No with specific reason options
  - **Positive Reasons**: No call needed, no visit needed, saved time, other
  - **Negative Reasons**: Irrelevant, confusing, not detailed enough, not what they wanted, other
  - **Survey Integration**: Links to external surveys for additional feedback collection

### Current Performance
- **Response Time**: Under 10 seconds for most queries
- **Accuracy**: Continuously monitored through expert feedback
- **Accessibility**: Tested with screen reader users
- **Uptime**: Production environment monitoring

### Continuous Monitoring and Evaluation

#### **Real-time Monitoring**
- **System Health**: CloudWatch metrics for uptime, response times, and error rates
- **User Feedback**: Continuous collection of public feedback and expert evaluations
- **Content Quality**: Automated tracking of citation accuracy and response relevance
- **Safety Metrics**: Monitoring of content filtering effectiveness and PI detection rates

#### **Evaluation Framework**
- **Expert Evaluation System**: Sentence-level scoring (100/80/0 points) with detailed explanations
- **Citation Rating**: Separate scoring for citation accuracy and relevance (25/20/0 points)
- **Weighted Scoring**: 75% sentence scores + 25% citation score for comprehensive assessment
- **Embedding Generation**: Expert feedback creates embeddings for automated AI evaluations
- **Public Feedback**: Simple "Was this helpful?" interface with detailed follow-up questions

#### **Performance Benchmarks**
- **Accuracy Target**: Continuous improvement toward 100% answer accuracy
- **Response Quality**: Maximum 4 sentences for clarity and reduced hallucination risk
- **Accessibility**: WCAG 2.1 AA compliance maintained
- **Language Support**: Equal quality for English and French responses

## Limitations and Constraints

### Technical Limitations
- **Language Models**: Dependent on OpenAI API availability
- **Content Freshness**: Dependent to some degree on government website content availability
- **Complex Queries**: May require clarifying questions for ambiguous requests
- **Jurisdiction**: Does not provide information about provincial/territorial/municipal services

### Operational Constraints
- **Rate Limits**: 3 questions per session
- **Character Limits**: 750 characters per question
- **Content Scope**: Government of Canada information only
- **Language**: Primary support for English and French

### Known Issues
- **Department Detection**: May occasionally misidentify relevant departments
- **Citation Accuracy**: URLs in prompts may become outdated as government sites change
- **Complex Scenarios**: Multi-step processes may require multiple interactions

## Administrative Features and Management

### User Roles and Access Control
- **Admin Users**: Full system access including user management, database operations, and system configuration
- **Partner Users**: Access to evaluation tools, batch processing, and performance metrics
- **Role-Based UI**: Different interfaces and capabilities based on user permissions
- **Authentication**: Secure login system with role-based route protection

### Admin Dashboard Capabilities

#### **User Management**
- Create, edit, and delete user accounts
- Manage user roles (admin/partner) and account status (active/inactive)
- View user creation dates and activity
- Bulk user operations with confirmation dialogs

#### **Batch Processing System**
- **Batch Creation**: Upload CSV files with questions for bulk AI evaluation
- **Batch Monitoring**: Track running, completed, and failed batch operations
- **Batch Management**: Cancel running batches, download results in CSV/Excel format
- **Context Derivation**: Automatic context generation for questions without provided context
- **Multi-Provider Support**: Process batches with OpenAI or Anthropic AI services

#### **Evaluation Tools**
- **Innovative Expert Evaluation System**: 
  - **In-App Evaluation**: Experts evaluate within the actual app interface, experiencing the same user experience
  - **Flexible Evaluation**: Experts can enter their own questions or use existing chat IDs to evaluate user conversations
  - **Sentence-Level Scoring**: Each sentence scored individually (100/80/0) with detailed explanations
  - **Citation Rating**: Separate scoring for citation accuracy (25/20/0 points)
  - **Weighted Total Score**: 75% sentence scores + 25% citation score
  - **Embedding Generation**: Expert feedback creates embeddings for automated AI evaluations
  - **Future Enhancement**: Embeddings will soon assist in answering questions quickly and accurately
- **Automated Evaluation**: Generate AI evaluations based on expert feedback patterns
- **Evaluation Regeneration**: Rebuild all evaluations with updated criteria
- **Progress Tracking**: Real-time monitoring of evaluation processing with batch statistics

#### **Database Management**
- **Data Export**: Export entire database or specific collections with date filtering
- **Data Import**: Bulk import data with chunked upload support for large datasets
- **Table Statistics**: View record counts across all database collections
- **Index Management**: Drop and rebuild database indexes for performance optimization
- **System Maintenance**: Repair timestamps, migrate data structures, clean system logs

#### **Performance Monitoring**
- **Chat Logs Dashboard**: View recent chat interactions with export capabilities
- **Metrics Dashboard**: Comprehensive performance analytics including:
  - Total conversations and interactions
  - Language breakdown (English/French)
  - AI-scored accuracy metrics
  - User feedback analysis
  - Public feedback reasons and scores
- **Real-time Charts**: Visual representation of system performance with bar charts and pie charts
- **Data Export**: Download metrics in JSON, CSV, and Excel formats

#### **System Configuration**
- **Service Status**: Toggle system availability (available/unavailable)
- **Deployment Mode**: Switch between CDS (background worker) and Vercel (wait for completion) modes
- **Settings Management**: Configure system-wide settings and parameters

#### **Chat Viewer and Analysis**
- **Chat Session Review**: View complete chat interactions by chat ID
- **Interaction Analysis**: Examine individual question-answer pairs with feedback
- **Expert Rating Interface**: Provide detailed expert feedback on AI responses with sentence-level scoring within the app interface
- **In-App Evaluation**: Experts can evaluate questions in the same interface users experience, or evaluate existing user conversations by chat ID
- **Public Feedback Analysis**: Manage public feedback collection and analysis
- **Separate Feedback Systems**: Expert evaluation (sentence-level) vs public feedback (helpful/not helpful)

### Partner-Specific Features
- **AI Service Selection**: Choose between OpenAI and Anthropic for testing
- **Search Service Toggle**: Switch between Google and Canada.ca search services
- **Expert Feedback Tools**: Access to detailed evaluation interfaces
- **Batch Processing**: Create and manage evaluation batches
- **Performance Metrics**: View system performance and user feedback analytics

## Deployment and Infrastructure

### Environment Configuration
- **Production Environment**:
  - **URL**: https://ai-answers.alpha.canada.ca
  - **Infrastructure**: AWS ECS with auto-scaling
  - **Database**: AWS DocumentDB with automated backups
  - **AI Services**: Azure OpenAI GPT models
  - **Monitoring**: CloudWatch metrics and logging
  - **Platform**: Departments can add prompt scenarios to meet specific needs

### Security
- **HTTPS**: All communications encrypted
- **API Security**: Rate limiting and authentication
- **Data Protection**: Encryption at rest and in transit
- **Access Control**: Role-based permissions

### Compliance
- **Official Languages**: Compliant with Canadian official languages requirements
- **Accessibility**: WCAG 2.1 AA compliance
- **Privacy**: PIPEDA compliance for data handling
- **Government Standards**: Canada.ca design system compliance

## Responsible AI Principles and Governance

### Core Principles
- **Accuracy First**: All responses must be accurate and verifiable through official government sources
- **Privacy by Design**: Personal information is never processed or stored unnecessarily
- **Accessibility for All**: Full compliance with accessibility standards and inclusive design
- **Transparency**: Clear documentation of system capabilities, limitations, and decision-making processes
- **Accountability**: Continuous monitoring and evaluation with human oversight
- **Fairness**: Equal treatment across languages, regions, and user groups

### Governance Framework
- **Oversight**: Canadian Digital Service (CDS) provides overall governance and oversight
- **Compliance**: Adherence to Government of Canada standards, policies, and legal requirements
- **Transparency**: Open source codebase and comprehensive documentation
- **Stakeholder Engagement**: Regular consultation with government departments and user communities
- **Continuous Improvement**: Regular review and updates based on feedback and evaluation results

### Ethical Considerations
- **Public Service Mandate**: System designed exclusively for public service, not commercial purposes
- **User Autonomy**: Users maintain control over their interactions and can choose not to use the service
- **Benefit Maximization**: Focus on providing maximum benefit to Canadian citizens and residents
- **Harm Minimization**: Comprehensive safety measures to prevent any potential harms
- **Cultural Sensitivity**: Respect for Canada's diverse population and official languages

## Future Development

### Planned Improvements
- **Enhanced Evaluation**: Automated response quality assessment
- **Additional Languages**: Support for Indigenous languages
- **Integration**: Direct integration with government service systems
- **Personalization**: Context-aware responses based on user history

### Research Areas
- **Response Quality**: Improving accuracy and helpfulness
- **User Experience**: Streamlining interaction patterns
- **Content Coverage**: Expanding to more government services
- **Accessibility**: Enhanced support for assistive technologies

## Contact and Support

### Technical Support
- **Issues**: GitHub repository for bug reports and feature requests
- **Documentation**: Comprehensive README and API documentation
- **Monitoring**: Real-time system status monitoring

### Governance
- **Oversight**: Canadian Digital Service (CDS)
- **Compliance**: Government of Canada standards and policies
- **Transparency**: Open source codebase and documentation

### Incident Response and Reporting
- **Incident Classification**: Clear categorization of incidents by severity and impact
- **Response Procedures**: Documented procedures for handling safety, privacy, or accuracy incidents
- **Reporting Mechanisms**: Multiple channels for reporting issues (GitHub, admin dashboard, direct contact)
- **Escalation Process**: Clear escalation paths for critical incidents
- **Post-Incident Review**: Systematic review and improvement process after incidents
- **Transparency**: Public reporting of significant incidents and lessons learned

### Contact and Reporting
- **Technical Issues**: GitHub repository for bug reports and feature requests
- **Safety Concerns**: Direct contact through admin dashboard or GitHub issues
- **Privacy Incidents**: Immediate reporting through designated channels
- **Accessibility Issues**: Dedicated accessibility feedback channels
- **General Feedback**: Multiple feedback mechanisms for different user types

---

*This system card is a living document that will be updated as the system evolves. For the most current information, please refer to the project repository.* 