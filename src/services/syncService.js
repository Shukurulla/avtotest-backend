import eavtoService from './eavtoService.js';
import Question from '../models/Question.js';
import Template from '../models/Template.js';
import SyncLog from '../models/SyncLog.js';
import { LANGUAGES } from '../config/constants.js';

class SyncService {
  async syncAll() {
    const startTime = new Date();

    const syncLog = await SyncLog.create({
      status: 'started',
      startedAt: startTime,
    });

    let totalQuestions = 0;
    let newQuestions = 0;
    let updatedQuestions = 0;
    const errors = [];

    try {
      // Step 1: Login to Eavto API
      console.log('🔐 Logging in to Eavto API...');
      await eavtoService.login();

      // Step 2: Fetch templates
      console.log('📋 Fetching templates...');
      const templates = await eavtoService.getTemplates();

      // Save templates to database
      for (const template of templates) {
        await Template.findOneAndUpdate(
          { templateId: template.id },
          {
            templateId: template.id,
            name: template.name,
            questionCount: template.exam_center_test_template_questions_count,
            status: 1,
          },
          { upsert: true, new: true }
        );
      }

      console.log(`✅ Saved ${templates.length} templates`);

      // Step 3: Sync questions for each template and language
      const languages = [LANGUAGES.UZBEK, LANGUAGES.RUSSIAN, LANGUAGES.CYRILLIC_UZBEK];

      for (const template of templates) {
        for (const langId of languages) {
          let retryCount = 0;
          const maxRetries = 5;
          let success = false;

          while (!success && retryCount < maxRetries) {
            try {
              console.log(
                `📥 Syncing Template ${template.id} - Language ${langId}${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}...`
              );

              const questions = await eavtoService.getTemplateQuestions(
                template.id,
                langId
              );

              console.log(`📝 Found ${questions.length} questions for Template ${template.id}, Language ${langId}`);

              for (let i = 0; i < questions.length; i++) {
                const question = questions[i];
                let questionRetryCount = 0;
                const maxQuestionRetries = 3;
                let questionSaved = false;

                // Har bir savolni saqlashda retry mexanizmi
                while (!questionSaved && questionRetryCount < maxQuestionRetries) {
                  try {
                    console.log(`📝 Processing question ${i + 1}/${questions.length}: ID ${question.id} (Template ${template.id}, Lang ${langId})`);

                    const result = await this.saveQuestion(question, langId, template);

                    totalQuestions++;

                    if (result.isNew) {
                      newQuestions++;
                      console.log(`✅ New question saved: ${question.id} (${i + 1}/${questions.length})`);
                    } else if (result.isUpdated) {
                      updatedQuestions++;
                      console.log(`🔄 Question updated: ${question.id} (${i + 1}/${questions.length})`);
                    } else {
                      console.log(`⏭️  Question unchanged: ${question.id} (${i + 1}/${questions.length})`);
                    }

                    questionSaved = true;

                    // Update sync log in database periodically (every 10 questions)
                    if (totalQuestions % 10 === 0) {
                      await SyncLog.findByIdAndUpdate(syncLog._id, {
                        status: 'in_progress',
                        totalQuestions,
                        newQuestions,
                        updatedQuestions,
                      });
                      console.log(`💾 Progress saved to MongoDB: ${totalQuestions} questions processed`);
                    }

                  } catch (questionError) {
                    questionRetryCount++;
                    console.error(`❌ Error saving question ${question.id} (Attempt ${questionRetryCount}/${maxQuestionRetries}):`, questionError.message);

                    if (questionRetryCount < maxQuestionRetries) {
                      const waitTime = 2000 * questionRetryCount; // 2s, 4s, 6s
                      console.log(`⏳ Waiting ${waitTime/1000}s before retrying question ${question.id}...`);
                      await this.delay(waitTime);
                    } else {
                      // Max retries reached for this question
                      console.error(`❌ FAILED to save question ${question.id} after ${maxQuestionRetries} attempts`);
                      errors.push({
                        questionId: question.id,
                        templateId: template.id,
                        langId,
                        error: questionError.message,
                        retries: questionRetryCount,
                      });
                    }
                  }
                }

                // Har bir savol o'rtasida kichik delay
                if (i < questions.length - 1) {
                  await this.delay(100);
                }
              }

              success = true;
              console.log(`✅ Template ${template.id} - Language ${langId} synced successfully (${questions.length} questions)`);

              // Delay between successful requests to avoid rate limiting
              await this.delay(1000);

            } catch (error) {
              retryCount++;

              // Check if it's a rate limit error (429)
              if (error.response?.status === 429 || error.message.includes('429')) {
                const waitTime = Math.min(5000 * retryCount, 30000); // Exponential backoff, max 30s
                console.log(
                  `⏳ Rate limited for template ${template.id}, lang ${langId}. Waiting ${waitTime/1000}s before retry ${retryCount}/${maxRetries}...`
                );
                await this.delay(waitTime);
              } else if (retryCount < maxRetries) {
                // For other errors, wait 2 seconds before retry
                console.log(
                  `⏳ Error for template ${template.id}, lang ${langId}. Retrying in 2s... (${retryCount}/${maxRetries})`
                );
                await this.delay(2000);
              }

              // If max retries reached, log error
              if (retryCount >= maxRetries) {
                console.error(
                  `❌ Failed to sync template ${template.id}, lang ${langId} after ${maxRetries} retries:`,
                  error.message
                );
                errors.push({
                  templateId: template.id,
                  langId,
                  error: error.message,
                  retries: retryCount,
                });
              }
            }
          }
        }
      }

      // Step 4: Update sync log
      const completedAt = new Date();
      const duration = Math.floor((completedAt - startTime) / 1000);

      await SyncLog.findByIdAndUpdate(syncLog._id, {
        status: 'completed',
        totalTemplates: templates.length,
        totalQuestions,
        newQuestions,
        updatedQuestions,
        errors,
        completedAt,
        duration,
      });

      console.log('✅ Sync completed successfully!');
      console.log(`📊 Total: ${totalQuestions}, New: ${newQuestions}, Updated: ${updatedQuestions}`);

      return {
        success: true,
        totalTemplates: templates.length,
        totalQuestions,
        newQuestions,
        updatedQuestions,
        errors,
        duration,
      };
    } catch (error) {
      console.error('❌ Sync failed:', error.message);

      const completedAt = new Date();
      const duration = Math.floor((completedAt - startTime) / 1000);

      await SyncLog.findByIdAndUpdate(syncLog._id, {
        status: 'failed',
        errors: [{ error: error.message }],
        completedAt,
        duration,
      });

      throw error;
    } finally {
      await eavtoService.logout();
    }
  }

  async saveQuestion(question, langId, currentTemplate = null) {
    if (!question || !question.id) {
      throw new Error('Invalid question data: question or question.id is missing');
    }

    try {
      console.log(`🔍 Checking if question ${question.id} exists in MongoDB...`);

      const existingQuestion = await Question.findOne({
        questionId: question.id,
        langId,
      });

      if (existingQuestion) {
        console.log(`📌 Question ${question.id} found in DB (ObjectId: ${existingQuestion._id})`);
      } else {
        console.log(`🆕 Question ${question.id} not found in DB, will create new`);
      }

      // Helper function to parse JavaScript literal strings
      const parseJavaScriptLiteral = (str) => {
        // If it's already an array or object, return it as-is
        if (typeof str !== 'string') {
          return str;
        }

        // Try JSON.parse first
        try {
          return JSON.parse(str);
        } catch (e) {
          // If JSON.parse fails, use Function constructor to execute JavaScript literal
          try {
            console.log(`   🔄 Using Function constructor to parse JavaScript literal...`);
            console.log(`   📝 Raw string (first 200 chars): ${str.substring(0, 200)}`);

            const func = new Function(`'use strict'; return (${str})`);
            const result = func();
            console.log(`   ✅ Successfully parsed using Function constructor`);
            console.log(`   📋 Result type: ${typeof result}, Is array: ${Array.isArray(result)}`);
            return result;
          } catch (funcError) {
            // Last resort: manual regex conversion
            try {
              console.log(`   🔄 Attempting manual regex conversion...`);
              console.log(`   ⚠️  Function error was: ${funcError.message}`);

              // More comprehensive regex replacement
              let jsonString = str
                // First, handle property names (word characters followed by colon)
                .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
                // Handle single-quoted values more carefully
                // This handles multi-line and special characters within single quotes
                .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, p1) => {
                  // Escape any double quotes inside the string
                  const escaped = p1.replace(/"/g, '\\"');
                  return `"${escaped}"`;
                });

              console.log(`   📝 Converted string sample: ${jsonString.substring(0, 150)}`);
              const parsed = JSON.parse(jsonString);
              console.log(`   ✅ Successfully parsed using regex conversion`);
              return parsed;
            } catch (regexError) {
              console.error(`❌ All parsing methods failed for: ${str.substring(0, 100)}...`);
              console.error(`   Function error: ${funcError.message}`);
              console.error(`   Regex error: ${regexError.message}`);
              throw new Error(`Failed to parse: ${regexError.message}`);
            }
          }
        }
      };

      // Parse body if it's a string (some API responses return JavaScript literals)
      let parsedBody = question.body;
      if (typeof question.body === 'string') {
        try {
          console.log(`🔧 Parsing body string for question ${question.id}`);
          console.log(`   Body type: ${typeof question.body}, Length: ${question.body.length}`);
          console.log(`   Body sample (first 150 chars): ${question.body.substring(0, 150)}`);

          parsedBody = parseJavaScriptLiteral(question.body);

          console.log(`✅ Body parsed successfully for question ${question.id}`);
          console.log(`   Parsed type: ${typeof parsedBody}, Is array: ${Array.isArray(parsedBody)}`);
        } catch (e) {
          console.error(`❌ Could not parse body for question ${question.id}:`, e.message);
          console.error(`   Body value (first 200 chars):`, question.body.substring(0, 200));
          throw new Error(`Invalid body format for question ${question.id}: ${e.message}`);
        }
      } else {
        console.log(`ℹ️  Body for question ${question.id} is already parsed (type: ${typeof parsedBody})`);
      }

      // Parse answers if needed
      let parsedAnswers = question.answers;
      if (Array.isArray(question.answers)) {
        parsedAnswers = question.answers.map((answer, index) => {
          if (typeof answer.body === 'string') {
            try {
              console.log(`🔧 Parsing answer ${index + 1} body for question ${question.id}`);
              const parsed = { ...answer, body: parseJavaScriptLiteral(answer.body) };
              console.log(`✅ Answer ${index + 1} body parsed successfully`);
              return parsed;
            } catch (e) {
              console.error(`❌ Could not parse answer ${index + 1} body for question ${question.id}:`, e.message);
              console.error(`   Answer body value (first 100 chars):`, answer.body.substring(0, 100));
              throw new Error(`Invalid answer body format for question ${question.id}, answer ${index + 1}: ${e.message}`);
            }
          }
          return answer;
        });
      }

      const stripFilesPrefix = (items) => {
        if (!Array.isArray(items)) return;
        for (const it of items) {
          if (it && typeof it.value === 'string' && it.value.startsWith('/files/')) {
            it.value = it.value.replace(/^\/files/, '');
          }
        }
      };
      stripFilesPrefix(parsedBody);
      if (Array.isArray(parsedAnswers)) {
        parsedAnswers.forEach((a) => stripFilesPrefix(a && a.body));
      }

      // Download image if exists
      let imagePath = null;
      const imageBody = parsedBody?.find((b) => b.type === 2);

      if (imageBody && imageBody.value) {
        try {
          console.log(`📥 Downloading image for question ${question.id}...`);
          imagePath = await eavtoService.downloadImage(
            imageBody.value,
            question.id
          );
          if (imagePath) {
            console.log(`✅ Image downloaded for question ${question.id}: ${imagePath}`);
          }
        } catch (imageError) {
          console.error(`⚠️  Failed to download image for question ${question.id}:`, imageError.message);
          // Continue without image
        }
      }

      // Prepare templates array
      let templates = question.templates || [];

      // If syncing from a specific template and the question doesn't have this template, add it
      if (currentTemplate) {
        const hasCurrentTemplate = templates.some(t => t.id === currentTemplate.id);
        if (!hasCurrentTemplate) {
          templates.push({
            id: currentTemplate.id,
            name: currentTemplate.name,
            status: 1
          });
        }
      }

      // Extract comment text (API sometimes returns object, sometimes string)
      let commentText = '';
      if (question.comment) {
        if (typeof question.comment === 'object' && question.comment.comment) {
          commentText = question.comment.comment;
        } else if (typeof question.comment === 'string') {
          commentText = question.comment;
        }
      }

      const questionData = {
        questionId: question.id,
        langId,
        body: parsedBody || [],
        answers: parsedAnswers || [],
        answerDescription: question.answer_description || '',
        answerVideo: question.answer_video || '',
        comment: commentText,
        staticOrderAnswers: question.static_order_answers || 0,
        isNew: question.is_new || 0,
        lessonId: question.newtest_lesson_id || null,
        status: question.status || 1,
        templates: templates,
        eduTypes: question.edu_types || [],
        imagePath,
        syncedAt: new Date(),
      };

      console.log(`📦 Question data prepared for MongoDB:`);
      console.log(`   - Question ID: ${questionData.questionId}`);
      console.log(`   - Language ID: ${questionData.langId}`);
      console.log(`   - Body items: ${questionData.body.length}`);
      console.log(`   - Answers: ${questionData.answers.length}`);
      console.log(`   - Templates from API:`, question.templates);
      console.log(`   - Templates in questionData: ${questionData.templates.length}`, questionData.templates);

      if (existingQuestion) {
        // Check if question has changed
        const hasChanged = JSON.stringify(existingQuestion.body) !== JSON.stringify(parsedBody) ||
                          JSON.stringify(existingQuestion.answers) !== JSON.stringify(parsedAnswers) ||
                          JSON.stringify(existingQuestion.templates) !== JSON.stringify(templates);

        if (hasChanged) {
          console.log(`💾 Updating question ${question.id} in MongoDB...`);
          const updated = await Question.findByIdAndUpdate(
            existingQuestion._id,
            questionData,
            { new: true, runValidators: true }
          );

          if (!updated) {
            throw new Error(`Failed to update question ${question.id} in MongoDB`);
          }

          console.log(`✅ Successfully updated question ${question.id} in MongoDB (ObjectId: ${updated._id})`);
          return { isNew: false, isUpdated: true };
        }

        console.log(`⏭️  Question ${question.id} unchanged, skipping update`);
        return { isNew: false, isUpdated: false };
      } else {
        console.log(`💾 Creating new question ${question.id} in MongoDB...`);
        console.log(`   Attempting Question.create() with data...`);

        const newQuestion = await Question.create(questionData);

        if (!newQuestion || !newQuestion._id) {
          throw new Error(`Failed to create question ${question.id} in MongoDB - no ID returned`);
        }

        console.log(`✅ Successfully created question ${question.id} in MongoDB (ObjectId: ${newQuestion._id})`);
        console.log(`   Verification: questionId=${newQuestion.questionId}, langId=${newQuestion.langId}`);

        return { isNew: true, isUpdated: false };
      }
    } catch (error) {
      console.error(`❌ CRITICAL ERROR saving question ${question.id} to MongoDB:`);
      console.error(`   Error name: ${error.name}`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);

      if (error.name === 'ValidationError') {
        console.error(`   Validation errors:`, error.errors);
      }

      throw new Error(`Failed to save question ${question.id}: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async syncSingleTemplate(templateId, langId) {
    const startTime = new Date();

    console.log(`🚀 Starting sync for Template ${templateId}, Language ${langId}`);

    try {
      // Login to API
      console.log('🔐 Logging in to Eavto API...');
      await eavtoService.login();

      // Get template info
      const templates = await eavtoService.getTemplates();
      const template = templates.find(t => t.id === parseInt(templateId));

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Save template to database
      await Template.findOneAndUpdate(
        { templateId: template.id },
        {
          templateId: template.id,
          name: template.name,
          questionCount: template.exam_center_test_template_questions_count,
          status: 1,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Template ${template.id} saved: ${template.name}`);

      let totalQuestions = 0;
      let newQuestions = 0;
      let updatedQuestions = 0;
      const errors = [];

      // Sync questions with retry mechanism
      let retryCount = 0;
      const maxRetries = 5;
      let success = false;

      while (!success && retryCount < maxRetries) {
        try {
          console.log(
            `📥 Fetching questions for Template ${templateId} - Language ${langId}${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}...`
          );

          const questionsRaw = await eavtoService.getTemplateQuestions(
            templateId,
            langId
          );

          console.log(`📝 Found ${questionsRaw.length} questions from API`);

          // Remove duplicates based on question ID
          const uniqueQuestions = [];
          const seenIds = new Set();

          for (const q of questionsRaw) {
            if (!seenIds.has(q.id)) {
              seenIds.add(q.id);
              uniqueQuestions.push(q);
            } else {
              console.log(`⚠️  Duplicate question detected and removed: ID ${q.id}`);
            }
          }

          const questions = uniqueQuestions;
          console.log(`✅ After removing duplicates: ${questions.length} unique questions`);

          // Log first question's structure to understand data format
          if (questions.length > 0) {
            console.log(`\n🔍 DEBUGGING: First question structure:`);
            console.log(`   Question ID: ${questions[0].id}`);
            console.log(`   Body type: ${typeof questions[0].body}`);
            console.log(`   Body value (raw):`, questions[0].body);
            if (questions[0].answers && questions[0].answers.length > 0) {
              console.log(`   First answer body type: ${typeof questions[0].answers[0].body}`);
              console.log(`   First answer body value (raw):`, questions[0].answers[0].body);
            }
            console.log(`\n`);
          }

          for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            let questionRetryCount = 0;
            const maxQuestionRetries = 3;
            let questionSaved = false;

            while (!questionSaved && questionRetryCount < maxQuestionRetries) {
              try {
                console.log(`📝 Processing question ${i + 1}/${questions.length}: ID ${question.id}`);

                const result = await this.saveQuestion(question, langId, template);

                totalQuestions++;

                if (result.isNew) {
                  newQuestions++;
                  console.log(`✅ New question saved: ${question.id} (${i + 1}/${questions.length})`);
                } else if (result.isUpdated) {
                  updatedQuestions++;
                  console.log(`🔄 Question updated: ${question.id} (${i + 1}/${questions.length})`);
                } else {
                  console.log(`⏭️  Question unchanged: ${question.id} (${i + 1}/${questions.length})`);
                }

                questionSaved = true;

              } catch (questionError) {
                questionRetryCount++;
                console.error(`❌ Error saving question ${question.id} (Attempt ${questionRetryCount}/${maxQuestionRetries}):`, questionError.message);

                if (questionRetryCount < maxQuestionRetries) {
                  const waitTime = 2000 * questionRetryCount;
                  console.log(`⏳ Waiting ${waitTime/1000}s before retrying question ${question.id}...`);
                  await this.delay(waitTime);
                } else {
                  console.error(`❌ FAILED to save question ${question.id} after ${maxQuestionRetries} attempts`);
                  errors.push({
                    questionId: question.id,
                    templateId: templateId,
                    langId,
                    error: questionError.message,
                    retries: questionRetryCount,
                  });
                }
              }
            }

            // Small delay between questions
            if (i < questions.length - 1) {
              await this.delay(100);
            }
          }

          success = true;
          console.log(`✅ Template ${templateId} - Language ${langId} synced successfully (${questions.length} questions)`);

        } catch (error) {
          retryCount++;

          if (error.response?.status === 429 || error.message.includes('429')) {
            const waitTime = Math.min(5000 * retryCount, 30000);
            console.log(
              `⏳ Rate limited. Waiting ${waitTime/1000}s before retry ${retryCount}/${maxRetries}...`
            );
            await this.delay(waitTime);
          } else if (retryCount < maxRetries) {
            console.log(
              `⏳ Error occurred. Retrying in 2s... (${retryCount}/${maxRetries})`
            );
            await this.delay(2000);
          }

          if (retryCount >= maxRetries) {
            console.error(`❌ Failed after ${maxRetries} retries:`, error.message);
            throw error;
          }
        }
      }

      const completedAt = new Date();
      const duration = Math.floor((completedAt - startTime) / 1000);

      console.log('✅ Sync completed!');
      console.log(`📊 Total: ${totalQuestions}, New: ${newQuestions}, Updated: ${updatedQuestions}`);

      return {
        success: true,
        templateId,
        langId,
        totalQuestions,
        newQuestions,
        updatedQuestions,
        errors,
        duration,
      };

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      throw error;
    } finally {
      await eavtoService.logout();
    }
  }

  async getLastSyncStatus() {
    const lastSync = await SyncLog.findOne().sort({ createdAt: -1 });
    return lastSync;
  }

  async getSyncHistory(limit = 10) {
    const history = await SyncLog.find()
      .sort({ createdAt: -1 })
      .limit(limit);
    return history;
  }
}

export default new SyncService();
