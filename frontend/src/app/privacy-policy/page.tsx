"use client";
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Shield, Eye, Lock, Database, FileText, MessageCircle, Brain } from 'lucide-react';
import Link from 'next/link';
import PageMeta from '../../components/PageMeta';

const PrivacyPolicyPage = () => {

  return (
    <>
      <PageMeta 
        title="Privacy & Data Policy | Ask Linc Information Handling" 
        description="Transparency in data handling is our commitment. Read Ask Linc's detailed privacy policy to understand how we collect, process, store, and protect your personal and financial information."
      />
      <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
          <div className="flex items-center space-x-3">
            <Link 
              href="/" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Home
            </Link>
            <a 
              href="/privacy" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Privacy Controls
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mb-6">Privacy Policy for Linc</h2>
            
            <p className="text-gray-300 mb-6">
              <strong>Last updated:</strong> July 27, 2025
            </p>

            <div className="space-y-8">
              <section>
                <h3 className="text-xl font-semibold mb-4">Introduction</h3>
                <p className="text-gray-300 mb-4">
                  At Linc, we believe your financial privacy is non-negotiable. This privacy policy explains how we collect, use, and protect your information when you use our AI-powered financial analysis service.
                </p>
                <p className="text-gray-300">
                  We are committed to transparency and giving you complete control over your data. This policy is written in plain English so you can understand exactly what we do with your information.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">What Information We Collect</h3>
                
                <h4 className="text-lg font-medium mb-3 text-blue-400">Financial Data (via Plaid)</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>Account balances and types</li>
                  <li>Transaction amounts, dates, and categories</li>
                  <li>Account names and institution information</li>
                  <li>Transaction merchant names and locations</li>
                </ul>

                <h4 className="text-lg font-medium mb-3 text-blue-400">What We Do NOT Collect</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>Your bank login credentials (handled securely by Plaid)</li>
                  <li>Account numbers or routing numbers</li>
                  <li>Personal identification information</li>
                  <li>Social Security numbers or tax information</li>
                </ul>

                <h4 className="text-lg font-medium mb-3 text-blue-400">Conversation Data</h4>
                <p className="text-gray-300">
                  We store your questions and our AI responses to provide conversation context and improve your experience. This data is anonymized before being processed by AI.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">How We Use Your Information</h3>
                
                <h4 className="text-lg font-medium mb-3 text-green-400">✅ What We Do</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>Analyze your financial data to answer your questions</li>
                  <li>Provide AI-powered insights about your spending and accounts</li>
                  <li>Maintain conversation history for context</li>
                  <li>Sync your financial data securely via Plaid</li>
                </ul>

                <h4 className="text-lg font-medium mb-3 text-red-400">❌ What We Never Do</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>Sell your data to third parties</li>
                  <li>Use your data to train AI models</li>
                  <li>Make transactions or move your money</li>
                  <li>Share your data with advertisers</li>
                  <li>Access your accounts without your permission</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">How We Protect Your Privacy</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-lg font-medium mb-3 text-green-400">Data Anonymization</h4>
                    <p className="text-gray-300 text-sm">
                      Before sending any data to AI for analysis, we anonymize sensitive information like account names, institution names, and merchant names. Your data is tokenized (e.g., &quot;Account_1&quot; instead of &quot;Chase Checking&quot;).
                    </p>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium mb-3 text-green-400">Read-Only Access</h4>
                    <p className="text-gray-300 text-sm">
                      We only have read-only access to your financial data through Plaid. We cannot make transactions, transfer money, or modify your accounts in any way.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium mb-3 text-green-400">Secure Infrastructure</h4>
                    <p className="text-gray-300 text-sm">
                      We use industry-standard encryption and security practices. Our infrastructure is hosted on secure cloud platforms with regular security audits.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium mb-3 text-green-400">No AI Training</h4>
                    <p className="text-gray-300 text-sm">
                      We use OpenAI&apos;s API which does not train on your data. Your financial information is never used to improve AI models or shared with AI training datasets.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">Your Rights and Controls</h3>
                
                <div className="space-y-4">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">View Your Data</h4>
                    <p className="text-gray-300 text-sm">
                      You can see exactly what data we have about you through our Privacy Dashboard. We show you counts of accounts, transactions, and conversations.
                    </p>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Delete All Data</h4>
                    <p className="text-gray-300 text-sm">
                      You can permanently delete all your data with one click. This removes all accounts, transactions, conversations, and Plaid connections.
                    </p>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Disconnect Accounts</h4>
                    <p className="text-gray-300 text-sm">
                      You can disconnect all your Plaid connections and clear financial data while keeping your conversation history if desired.
                    </p>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Export Your Data</h4>
                    <p className="text-gray-300 text-sm">
                      You can request a copy of all your data in a machine-readable format. Contact us to arrange data export.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">Third-Party Services</h3>
                
                <h4 className="text-lg font-medium mb-3">Plaid</h4>
                <p className="text-gray-300 mb-4">
                  We use Plaid to securely connect to your financial accounts. Plaid is SOC 2-compliant and used by major financial institutions. They handle the secure connection to your bank - we never see your login credentials.
                </p>

                <h4 className="text-lg font-medium mb-3">OpenAI</h4>
                <p className="text-gray-300 mb-4">
                  We use OpenAI&apos;s API to power our AI analysis. OpenAI does not train on your data and maintains strict privacy controls. All data sent to OpenAI is anonymized.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">Data Retention</h3>
                <p className="text-gray-300">
                  We retain your data only as long as necessary to provide our service. By default, we keep data for 30 days, but you can delete it at any time. When you delete your data, it is permanently removed from our systems.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">Changes to This Policy</h3>
                <p className="text-gray-300">
                  We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on our website and updating the &quot;Last updated&quot; date.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">Contact Us</h3>
                <p className="text-gray-300">
                  If you have any questions about this privacy policy or our data practices, please contact us at privacy@asklinc.com
                </p>
              </section>

              <div className="bg-blue-900 border border-blue-700 rounded-lg p-6 mt-8">
                <h3 className="text-lg font-semibold mb-3 text-blue-200">Your Privacy is Our Priority</h3>
                <p className="text-blue-100 text-sm">
                  We built Linc with privacy and security as foundational principles, not afterthoughts. Every feature is designed to give you complete control over your data while providing powerful financial insights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default PrivacyPolicyPage; 