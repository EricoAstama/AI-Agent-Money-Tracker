# Use the official Node.js 20 slim image
FROM node:20-slim

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Set environment variables (these should ideally be set in HF Space Settings)
# Port 7860 is the default for Hugging Face Spaces
ENV PORT=7860

# Expose the port
EXPOSE 7860

# Start the bot
CMD [ "node", "index.js" ]
