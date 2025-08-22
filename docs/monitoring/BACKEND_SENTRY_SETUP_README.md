# Backend Sentry Setup - Complete Guide

## 🎯 What We Just Built

Your backend now has **comprehensive Sentry integration** that will capture:

✅ **AI Performance Data** - Response times, question lengths, user tiers  
✅ **Error Tracking** - All backend errors with full context  
✅ **Performance Spans** - Detailed timing for every AI request  
✅ **User Context** - User IDs, tiers, and request details  
✅ **Cron Job Monitoring** - Background task error tracking  

## 🚀 What's Now Working

### **1. AI Performance Monitoring**
- **All AI endpoints** now send performance data to Sentry
- **Response times** are tracked with detailed attributes
- **Question analysis** (length, complexity) is captured
- **User tier information** is included for segmentation

### **2. Error Tracking**
- **Every catch block** now captures errors in Sentry
- **Full error context** including stack traces
- **Request details** (user ID, endpoint, timing)
- **Background job errors** (cron jobs, data processing)

### **3. Performance Spans**
- **AI Request Spans** with detailed attributes
- **Response Time Tracking** for performance analysis
- **User Context** for segmentation and analysis
- **Endpoint Identification** for routing analysis

## 📊 What You'll See in Sentry

### **Performance Tab:**
- **AI Response Times** with detailed breakdowns
- **User Tier Performance** (starter vs premium)
- **Question Length Impact** on response times
- **Endpoint Performance** comparisons

### **Issues Tab:**
- **Backend Errors** with full context
- **Performance Degradations** tracked over time
- **User-Specific Issues** for targeted debugging
- **Cron Job Failures** with timing data

### **Releases Tab:**
- **Performance Changes** between deployments
- **Error Rate Changes** over time
- **User Experience Impact** of changes

## 🔧 Next Steps

### **1. Add Environment Variables**
Add to your backend `.env`:
```bash
SENTRY_DSN=your_backend_sentry_dsn_here
NODE_ENV=development  # or production
```

### **2. Deploy Your Backend**
```bash
npm run build:render
# or your deployment command
```

### **3. Test the Integration**
- Make some AI requests
- Check Sentry Performance tab
- Look for new spans and metrics

### **4. Set Up Performance Alerts**
- Go to Sentry → Performance → Alerts
- Create alerts for AI response times
- Set thresholds (e.g., p95 > 5 seconds)

## 📈 Performance Metrics Available

### **AI Response Time Attributes:**
- `ai.question_length` - Question character count
- `ai.user_tier` - User subscription tier
- `ai.is_demo` - Demo vs production mode
- `ai.response_time_ms` - Total response time
- `ai.endpoint` - Which AI endpoint was used
- `ai.user_id` - User identifier (if authenticated)

### **Error Context:**
- **Full stack traces** for debugging
- **Request parameters** for reproduction
- **User context** for impact assessment
- **Timing data** for performance correlation

## 🎯 Key Benefits

### **Immediate:**
- **Real-time monitoring** of AI performance
- **Error visibility** across all endpoints
- **Performance baselines** for optimization

### **Long-term:**
- **Performance trends** over time
- **User experience insights** by tier
- **Optimization opportunities** identification
- **Proactive issue detection**

## 🔍 Monitoring Your AI Endpoints

### **Main AI Endpoints:**
- `/ask` - General AI advice
- `/ask/tier-aware` - Tier-specific responses
- `/ask/display-real` - Real data processing

### **What's Tracked:**
- **Response times** for every request
- **Question analysis** for optimization
- **User segmentation** by tier
- **Error rates** and types
- **Performance patterns** over time

## 🚨 Setting Up Alerts

### **Performance Alerts:**
1. Go to **Sentry → Performance → Alerts**
2. Click **Create Alert**
3. Set **Metric**: `p95(span.duration)`
4. Set **Filter**: `transaction:*ask*`
5. Set **Threshold**: `> 5000` (5 seconds)
6. **Save and activate**

### **Error Rate Alerts:**
1. Go to **Sentry → Alerts**
2. Click **Create Alert**
3. Set **Metric**: `error_rate()`
4. Set **Filter**: `transaction:*ask*`
5. Set **Threshold**: `> 0.05` (5% error rate)
6. **Save and activate**

## 📊 Dashboard Setup

### **AI Performance Dashboard:**
1. Go to **Sentry → Dashboards**
2. Create new dashboard
3. Add widgets:
   - **AI Response Time Trends**
   - **Error Rate by Endpoint**
   - **Performance by User Tier**
   - **Question Length Impact**

## 🎉 You're All Set!

Your backend now has **enterprise-grade monitoring** that will:

- **Track every AI request** with detailed metrics
- **Capture all errors** with full context
- **Monitor performance** in real-time
- **Provide insights** for optimization
- **Alert you** to issues before users notice

**Next**: Deploy this to your backend and start seeing your AI performance data in Sentry!
