// State management
let currentMode = 'upload';
let uploadedFile = null;
let resumeText = '';
let analysisResults = null;
let showOriginal = false;

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Page navigation
function showLandingPage() {
    hideAllPages();
    document.getElementById('landing-page').classList.add('active');
}

function showUploadPage() {
    hideAllPages();
    document.getElementById('upload-page').classList.add('active');
}

function showResultsPage() {
    hideAllPages();
    document.getElementById('results-page').classList.add('active');
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
}

// Upload mode toggle
function setUploadMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    
    document.querySelectorAll('.input-mode').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(`${mode}-mode`).classList.add('active');
}

// File upload handling
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!validTypes.includes(file.type)) {
        showError('Please upload a PDF or DOCX file');
        return;
    }
    
    uploadedFile = file;
    document.getElementById('upload-zone').classList.add('hidden');
    document.getElementById('file-info').classList.remove('hidden');
    document.querySelector('.file-name').textContent = file.name;
    hideError();
}

function clearFile() {
    uploadedFile = null;
    fileInput.value = '';
    document.getElementById('upload-zone').classList.remove('hidden');
    document.getElementById('file-info').classList.add('hidden');
}

// File parsing
async function parseFile(file) {
    const fileType = file.type;
    
    if (fileType === 'application/pdf') {
        return await parsePDF(file);
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await parseDOCX(file);
    }
    
    throw new Error('Unsupported file type');
}

async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        text += pageText + '\n';
    }
    
    return normalizeText(text);
}

async function parseDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return normalizeText(result.value);
}

function normalizeText(text) {
    // Remove extra spaces and normalize line breaks
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

// Error handling
function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error-message').classList.add('hidden');
}

// Resume analysis
async function analyzeResume() {
    const apiKey = document.getElementById('api-key').value.trim();
    
    if (!apiKey) {
        showError('Please enter your Groq API key');
        return;
    }
    
    try {
        // Get resume text
        if (currentMode === 'upload') {
            if (!uploadedFile) {
                showError('Please upload a file first');
                return;
            }
            resumeText = await parseFile(uploadedFile);
        } else {
            resumeText = document.getElementById('resume-text').value.trim();
            if (!resumeText) {
                showError('Please paste your resume text');
                return;
            }
        }
        
        if (resumeText.length < 100) {
            showError('Resume text is too short. Please provide more content.');
            return;
        }
        
        hideError();
        showResultsPage();
        showLoading();
        
        // Call Groq API
        analysisResults = await callGroq(apiKey, resumeText);
        
        hideLoading();
        displayResults(analysisResults);
        
    } catch (error) {
        hideLoading();
        showUploadPage();
        showError(error.message || 'An error occurred while analyzing your resume');
    }
}

async function callGroq(apiKey, text) {
    // Escape special characters for JSON safety
    const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    
    const prompt = `You are a professional resume reviewer and career coach.
Analyze the following resume and provide:

1. A score out of 100
2. A brief summary of strengths and weaknesses
3. Detailed section-by-section feedback for:
   - Header / Contact Info
   - Summary / Objective
   - Experience
   - Projects
   - Skills
   - Education
4. Specific rewritten bullet points to improve impact
5. Missing keywords for ATS optimization
6. Suggestions to improve clarity, metrics, and action verbs
7. Tone & Impact Suggestions
8. Grammar / Clarity Fixes

Be concise but actionable. Focus on real improvements, not generic advice.

Resume text:
${safeText}

Please format your response as JSON with the following structure:
{
    "score": number,
    "summary": string,
    "sections": {
        "header": string,
        "summary": string,
        "experience": string,
        "projects": string,
        "skills": string,
        "education": string
    },
    "bulletImprovements": string,
    "missingKeywords": string,
    "toneSuggestions": string,
    "grammarFixes": string
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional resume reviewer. Always respond with valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 3000
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to analyze resume');
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON response
    try {
        return JSON.parse(content);
    } catch (e) {
        // If JSON parsing fails, try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Failed to parse AI response');
    }
}

function showLoading() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('results-content').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('results-content').classList.remove('hidden');
}

function displayResults(results) {
    // Animate score
    animateScore(results.score);
    
    // Set summary
    document.getElementById('summary-text').textContent = results.summary;
    
    // Set section feedback
    document.getElementById('header-feedback').textContent = results.sections.header || 'No specific feedback for this section.';
    document.getElementById('summary-feedback').textContent = results.sections.summary || 'No specific feedback for this section.';
    document.getElementById('experience-feedback').textContent = results.sections.experience || 'No specific feedback for this section.';
    document.getElementById('projects-feedback').textContent = results.sections.projects || 'No specific feedback for this section.';
    document.getElementById('skills-feedback').textContent = results.sections.skills || 'No specific feedback for this section.';
    document.getElementById('education-feedback').textContent = results.sections.education || 'No specific feedback for this section.';
    
    // Set other feedback
    document.getElementById('bullet-feedback').textContent = results.bulletImprovements || 'No bullet improvements needed.';
    document.getElementById('keywords-feedback').textContent = results.missingKeywords || 'No missing keywords identified.';
    document.getElementById('tone-feedback').textContent = results.toneSuggestions || 'No tone suggestions.';
    document.getElementById('grammar-feedback').textContent = results.grammarFixes || 'No grammar issues found.';
}

function animateScore(targetScore) {
    const scoreEl = document.getElementById('score-number');
    let currentScore = 0;
    const duration = 1500;
    const steps = 60;
    const increment = targetScore / steps;
    
    const timer = setInterval(() => {
        currentScore += increment;
        if (currentScore >= targetScore) {
            currentScore = targetScore;
            clearInterval(timer);
        }
        scoreEl.textContent = Math.round(currentScore);
    }, duration / steps);
}

// Toggle original/improved view
function toggleOriginal() {
    showOriginal = !showOriginal;
    const toggleText = document.getElementById('toggle-text');
    toggleText.textContent = showOriginal ? 'Show Improved' : 'Show Original';
    
    if (showOriginal) {
        // Show original resume text in feedback sections
        document.querySelectorAll('.feedback-content').forEach(el => {
            el.dataset.original = el.textContent;
            el.textContent = resumeText;
        });
    } else {
        // Restore improved feedback
        document.querySelectorAll('.feedback-content').forEach(el => {
            if (el.dataset.original) {
                el.textContent = el.dataset.original;
            }
        });
    }
}

// Copy improved resume
function copyImproved() {
    if (!analysisResults) return;
    
    let improvedText = `RESUME SCORE: ${analysisResults.score}/100\n\n`;
    improvedText += `SUMMARY:\n${analysisResults.summary}\n\n`;
    improvedText += `SECTION FEEDBACK:\n`;
    improvedText += `Header: ${analysisResults.sections.header}\n`;
    improvedText += `Summary: ${analysisResults.sections.summary}\n`;
    improvedText += `Experience: ${analysisResults.sections.experience}\n`;
    improvedText += `Projects: ${analysisResults.sections.projects}\n`;
    improvedText += `Skills: ${analysisResults.sections.skills}\n`;
    improvedText += `Education: ${analysisResults.sections.education}\n\n`;
    improvedText += `BULLET IMPROVEMENTS:\n${analysisResults.bulletImprovements}\n\n`;
    improvedText += `MISSING KEYWORDS:\n${analysisResults.missingKeywords}\n\n`;
    improvedText += `TONE SUGGESTIONS:\n${analysisResults.toneSuggestions}\n\n`;
    improvedText += `GRAMMAR FIXES:\n${analysisResults.grammarFixes}`;
    
    navigator.clipboard.writeText(improvedText).then(() => {
        alert('Improved resume copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Generate full rewrite
async function generateFullRewrite() {
    const apiKey = document.getElementById('api-key').value.trim();
    const rewriteContent = document.getElementById('rewrite-content');
    
    rewriteContent.classList.remove('hidden');
    rewriteContent.innerHTML = '<div class="loading-spinner"></div><p style="text-align: center; margin-top: 1rem; color: #9999b5;">Generating improved resume...</p>';
    
    try {
        // Escape special characters for JSON safety
        const safeResumeText = resumeText.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        
        const prompt = `You are a professional resume writer. Rewrite the following resume to be more impactful, professional, and ATS-optimized. Keep the same structure but improve the language, add action verbs, include metrics where appropriate, and enhance the overall impact.

Original resume:
${safeResumeText}

Please provide the fully rewritten resume in a clean, professional format.`;
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional resume writer. Create clean, well-formatted resumes.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 4000
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate rewrite');
        }
        
        const data = await response.json();
        const rewrittenResume = data.choices[0].message.content;
        
        rewriteContent.textContent = rewrittenResume;
        
    } catch (error) {
        rewriteContent.innerHTML = `<p style="color: var(--error);">Error: ${error.message}</p>`;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    showLandingPage();
});
