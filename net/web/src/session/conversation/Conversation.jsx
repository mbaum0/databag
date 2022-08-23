import { ConversationWrapper } from './Conversation.styled';
import { SettingOutlined, RightOutlined, CloseOutlined } from '@ant-design/icons';
import { useConversation } from './useConversation.hook';
import { Logo } from 'logo/Logo';
import { AddTopic } from './addTopic/AddTopic';
import { VirtualList } from './virtualList/VirtualList';
import { TopicItem } from './topicItem/TopicItem';

export function Conversation({ closeConversation, openDetails, cardId, channelId }) {

  const { state, actions } = useConversation(cardId, channelId);

  const topicRenderer = (topic) => {
    return (<TopicItem host={cardId == null} topic={topic} />)
  }

  return (
    <ConversationWrapper>
      <div class="header">
        <div class="title">
          <div class="logo">
            <Logo img={state.image} url={state.logo} width={32} height={32} radius={4} />
          </div>
          <div class="label">{ state.subject }</div>
          { state.display !== 'xlarge' && (
            <div class="button" onClick={openDetails}>
              <SettingOutlined />
            </div>
          )}
        </div>
        { state.display !== 'xlarge' && (
          <div class="button" onClick={closeConversation}>
            <CloseOutlined />
          </div>
        )}
      </div>
      <div class="thread">
        <VirtualList id={channelId + cardId}
            items={state.topics} itemRenderer={topicRenderer} onMore={actions.more} />
      </div>
      <div class="divider">
        <div class="line" />
      </div>
      <div class="topic">
        <AddTopic cardId={cardId} channelId={channelId} />
      </div>
    </ConversationWrapper>
  );
}

