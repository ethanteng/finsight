"use client";
import { useEffect, useState } from 'react';

export default function BlogSubscription() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsSubmitting(true);
    
    try {
      // Submit to MailerLite via fetch
      const formData = new FormData();
      formData.append('fields[email]', email);
      formData.append('ml-submit', '1');
      formData.append('anticsrf', 'true');
      
      const response = await fetch('https://assets.mailerlite.com/jsonp/1687893/forms/163474981491050102/subscribe', {
        method: 'POST',
        body: formData,
        mode: 'no-cors' // Prevent CORS issues
      });
      
      // Show success message
      const formElement = document.querySelector('#mlb2-29949050 .ml-form-embedBody') as HTMLElement;
      const successElement = document.querySelector('#mlb2-29949050 .ml-form-successBody') as HTMLElement;
      
      if (formElement && successElement) {
        formElement.style.display = 'none';
        successElement.style.display = 'block';
      }
      
      setEmail(''); // Clear the email field
    } catch (error) {
      console.error('Subscription error:', error);
      // You could show an error message here if needed
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return <div className="mb-12" />; // Empty placeholder until client-side render
  }

  return (
    <div className="mb-12 flex justify-center">
      <div className="w-full max-w-md px-4">
        <style type="text/css">
          {`
            @import url("https://assets.mlcdn.com/fonts.css?version=1755584");
            
            #mlb2-29949050.ml-form-embedContainer {
              box-sizing: border-box;
              display: table;
              margin: 0 auto;
              position: static;
              width: 100% !important;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper {
              background-color: #ffffff;
              border-width: 0px;
              border-color: transparent;
              border-radius: 4px;
              border-style: solid;
              box-sizing: border-box;
              display: inline-block !important;
              margin: 0;
              padding: 0;
              position: relative;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper.embedForm { 
              max-width: 400px; 
              width: 100%; 
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody {
              padding: 20px 20px 20px 20px !important;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-embedBodyHorizontal {
              padding-bottom: 20px !important;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-embedContent h4 {
              color: #000000;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 30px;
              font-weight: 400;
              margin: 0 0 10px 0;
              text-align: left;
              word-break: break-word;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-embedContent p {
              color: #000000;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 14px;
              font-weight: 400;
              line-height: 20px;
              margin: 0 0 20px 0;
              text-align: left;
            }
            
            .ml-form-formContent.horozintalForm .ml-form-horizontalRow .ml-input-horizontal { 
              width: 70%; 
              float: left; 
            }
            
            .ml-form-formContent.horozintalForm .ml-form-horizontalRow .ml-button-horizontal { 
              width: 30%; 
              float: left; 
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-horizontalRow input {
              background-color: #ffffff;
              color: #333333;
              border-color: #cccccc;
              border-radius: 4px;
              border-style: solid;
              border-width: 1px;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 14px;
              line-height: 20px;
              margin-bottom: 0;
              margin-top: 0;
              padding: 10px 10px;
              width: 100%;
              box-sizing: border-box;
              overflow-y: initial;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-horizontalRow button {
              background-color: #000000 !important;
              border-color: #000000;
              border-style: solid;
              border-width: 1px;
              border-radius: 4px;
              box-shadow: none;
              color: #ffffff !important;
              cursor: pointer;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 14px !important;
              font-weight: 700;
              line-height: 20px;
              margin: 0 !important;
              padding: 10px !important;
              width: 100%;
              height: auto;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-embedBody .ml-form-horizontalRow button:hover {
              background-color: #333333 !important;
              border-color: #333333 !important;
            }
            
            /* Success message styling - override MailerLite's white text */
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-successBody .ml-form-successContent h4 {
              color: #000000 !important;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 30px;
              font-weight: 400;
              margin: 0 0 10px 0;
              text-align: center;
              word-break: break-word;
            }
            
            #mlb2-29949050.ml-form-embedContainer .ml-form-embedWrapper .ml-form-successBody .ml-form-successContent p {
              color: #000000 !important;
              font-family: 'Open Sans', Arial, Helvetica, sans-serif;
              font-size: 14px;
              font-weight: 400;
              line-height: 20px;
              margin: 0 0 20px 0;
              text-align: center;
            }
            
            @media only screen and (max-width: 400px) {
              .ml-form-embedWrapper.embedDefault, .ml-form-embedWrapper.embedPopup { 
                width: 100%!important; 
              }
              .ml-form-formContent.horozintalForm { 
                float: left!important; 
              }
              .ml-form-formContent.horozintalForm .ml-form-horizontalRow { 
                height: auto!important; 
                width: 100%!important; 
                float: left!important; 
              }
              .ml-form-formContent.horozintalForm .ml-form-horizontalRow .ml-input-horizontal { 
                width: 100%!important; 
              }
              .ml-form-formContent.horozintalForm .ml-button-horizontal { 
                width: 100%!important; 
              }
            }
          `}
        </style>

        <div className="bg-white rounded-lg shadow-lg px-6 pt-3 pb-6">
          <div id="mlb2-29949050" className="ml-form-embedContainer ml-subscribe-form ml-subscribe-form-29949050">
            <div className="ml-form-align-center">
              <div className="ml-form-embedWrapper embedForm">
                <div className="ml-form-embedBody ml-form-embedBodyHorizontal row-form">
                <div className="ml-form-embedContent">
                  <h4>Subscribe for updates</h4>
                  <p>Stay up to date on the economy & how it impacts your wallet. Plus occasional product news.</p>
                </div>

                <form className="ml-block-form" onSubmit={handleSubmit} data-code="" method="post">
                  <div className="ml-form-formContent horozintalForm">
                    <div className="ml-form-horizontalRow">
                      <div className="ml-input-horizontal">
                        <div style={{width: "100%"}} className="horizontal-fields">
                          <div className="ml-field-group ml-field-email ml-validate-email ml-validate-required">
                            <input 
                              type="email" 
                              className="form-control" 
                              data-inputmask="" 
                              name="fields[email]" 
                              placeholder="Email" 
                              autoComplete="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="ml-button-horizontal primary">
                        <button type="submit" className="primary" disabled={isSubmitting}>
                          {isSubmitting ? 'Subscribing...' : 'Subscribe'}
                        </button>
                        <button disabled style={{display: "none"}} type="button" className="loading">
                          <div className="ml-form-embedSubmitLoad"></div>
                          <span className="sr-only">Loading...</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <input type="hidden" name="ml-submit" value="1" />
                  <input type="hidden" name="anticsrf" value="true" />
                </form>
              </div>

              <div className="ml-form-successBody row-success" style={{display: "none"}}>
                <div className="ml-form-successContent">
                  <h4>Thank you!</h4>
                  <p>You're now subscribed to daily updates on the economy & occasional product news.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        <script src="https://groot.mailerlite.com/js/w/webforms.min.js?v176e10baa5e7ed80d35ae235be3d5024" type="text/javascript"></script>

        <script>
          {`
            fetch("https://assets.mailerlite.com/jsonp/1687893/forms/163474981491050102/takel")
          `}
        </script>
      </div>
    </div>
  );
}
