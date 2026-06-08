export class QuestionProvider {
  async getQuestions(topic, optionCount, excludeIds) {
    throw new Error(`QuestionProvider.getQuestions not implemented for topic ${topic}`);
  }
}
