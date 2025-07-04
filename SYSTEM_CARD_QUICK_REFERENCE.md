# AI Answers - Quick Reference System Card

## What is AI Answers?
A specialized AI assistant for Government of Canada websites that provides accurate, brief answers to questions about government services, with a single appropriate citation. AI Answers is model-independent, with an innovative evaluation system that uses detailed human expert evaluations to fuel automated AI evaluations and accurate answers. 

## Key Facts
- **Purpose**: Help users navigate Canada.ca and government services
- **Scope**: Government of Canada information only (Canada.ca, gc.ca and federal organization domains)
- **Languages**: English and French (official language compliant) - responds in other languages
- **Status**: Preparing for public pilot
- **Production URL**: https://ai-answers.alpha.canada.ca
- **Platform**: Departments can add prompt scenarios to meet specific needs
- **Staging URL**: ai-answers.cdssandbox.xyz

## Safety & Privacy
- ✅ **PII Protection**: Most personal information is blocked from being sent to AI or logged
- ✅ **Content Filtering**: Blocks inappropriate content and threats and manipulation 
- ✅ **Rate Limiting**: 3 questions per session
- ✅ **Character Limits**: 750 characters per question

## Technical Details
- **AI Models**: Azure OpenAI GPT-4 (production) 
- **Architecture**: React frontend + Node.js microservices
- **Database**: AWS DocumentDB (production)
- **Agentic Behavior**: AI uses tools including downloadWebPage for content verification 

## Admin Features
- **User Management**: Admin and partner role management
- **Batch Processing**: Bulk AI evaluation with CSV uploads
- **Evaluation Tools**: Expert feedback and automated evaluation generation
- **Database Management**: Export/import, maintenance, and monitoring
- **Performance Metrics**: Real-time analytics and reporting
- **System Configuration**: Service status and deployment mode controls

## Response Quality
- **Length**: Maximum 4 sentences per answer
- **Style**: Plain language matching Canada.ca standards
- **Citations**: Every answer includes verified government source link
- **Evaluation**: Continuous improvement through expert feedback

## Limitations
- Does not provide information about provincial/territorial/municipal services
- Dependent to some degree on government website content availability

## Compliance
- Official Languages Act compliance
- WCAG 2.1 AA accessibility standards
- PIPEDA privacy compliance
- Canada.ca design system compliance

## Contact
- **Organization**: Canadian Digital Service (CDS)
- **Repository**: GitHub (open source)
- **Documentation**: Comprehensive README and system card

---
*For detailed information, see SYSTEM_CARD.md* 