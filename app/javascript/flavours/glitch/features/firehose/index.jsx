import PropTypes from 'prop-types';
import { useRef, useCallback, useEffect } from 'react';

import { useIntl, defineMessages, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';
import { NavLink } from 'react-router-dom';

import { addColumn } from 'flavours/glitch/actions/columns';
import { changeSetting } from 'flavours/glitch/actions/settings';
import { connectPublicStream, connectCommunityStream } from 'flavours/glitch/actions/streaming';
import { expandPublicTimeline, expandCommunityTimeline } from 'flavours/glitch/actions/timelines';
import { DismissableBanner } from 'flavours/glitch/components/dismissable_banner';
import SettingText from 'flavours/glitch/components/setting_text';
import initialState, { domain } from 'flavours/glitch/initial_state';
import { useAppDispatch, useAppSelector } from 'flavours/glitch/store';

import Column from '../../components/column';
import ColumnHeader from '../../components/column_header';
import SettingToggle from '../notifications/components/setting_toggle';
import StatusListContainer from '../ui/containers/status_list_container';

const messages = defineMessages({
  title: { id: 'column.firehose', defaultMessage: 'Live feeds' },
  filter_regex: { id: 'home.column_settings.filter_regex', defaultMessage: 'Filter out by regular expressions' },
});

// TODO: use a proper React context later on
const useIdentity = () => ({
  signedIn: !!initialState.meta.me,
  accountId: initialState.meta.me,
  disabledAccountId: initialState.meta.disabled_account_id,
  accessToken: initialState.meta.access_token,
  permissions: initialState.role ? initialState.role.permissions : 0,
});

const ColumnSettings = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.getIn(['settings', 'firehose']));
  const onChange = useCallback(
    (key, checked) => dispatch(changeSetting(['firehose', ...key], checked)),
    [dispatch],
  );

  return (
    <div>
      <div className='column-settings__row'>
        <SettingToggle
          settings={settings}
          settingPath={['onlyMedia']}
          onChange={onChange}
          label={<FormattedMessage id='community.column_settings.media_only' defaultMessage='Media only' />}
        />
        <SettingToggle
          settings={settings}
          settingPath={['allowLocalOnly']}
          onChange={onChange}
          label={<FormattedMessage id='firehose.column_settings.allow_local_only' defaultMessage='Show local-only posts in "All"' />}
        />
        <span className='column-settings__section'><FormattedMessage id='home.column_settings.advanced' defaultMessage='Advanced' /></span>
        <SettingText
          settings={settings}
          settingPath={['regex', 'body']}
          onChange={onChange}
          label={intl.formatMessage(messages.filter_regex)}
        />
      </div>
    </div>
  );
};

const Firehose = ({ feedType, multiColumn }) => {
  const dispatch = useAppDispatch();
  const intl = useIntl();
  const { signedIn } = useIdentity();
  const columnRef = useRef(null);

  const onlyMedia = useAppSelector((state) => state.getIn(['settings', 'firehose', 'onlyMedia'], false));
  const hasUnread = useAppSelector((state) => state.getIn(['timelines', `${feedType}${onlyMedia ? ':media' : ''}`, 'unread'], 0) > 0);

  const allowLocalOnly = useAppSelector((state) => state.getIn(['settings', 'firehose', 'allowLocalOnly']));
  const regex = useAppSelector((state) => state.getIn(['settings', 'firehose', 'regex', 'body']));

  const handlePin = useCallback(
    () => {
      switch(feedType) {
      case 'community':
        dispatch(addColumn('COMMUNITY', { other: { onlyMedia }, regex: { body: regex } }));
        break;
      case 'public':
        dispatch(addColumn('PUBLIC', { other: { onlyMedia, allowLocalOnly }, regex: { body: regex }  }));
        break;
      case 'public:remote':
        dispatch(addColumn('REMOTE', { other: { onlyMedia, onlyRemote: true }, regex: { body: regex }  }));
        break;
      }
    },
    [dispatch, onlyMedia, feedType, allowLocalOnly, regex],
  );

  const handleLoadMore = useCallback(
    (maxId) => {
      switch(feedType) {
      case 'community':
        dispatch(expandCommunityTimeline({ maxId, onlyMedia }));
        break;
      case 'public':
        dispatch(expandPublicTimeline({ maxId, onlyMedia, allowLocalOnly }));
        break;
      case 'public:remote':
        dispatch(expandPublicTimeline({ maxId, onlyMedia, onlyRemote: true }));
        break;
      }
    },
    [dispatch, onlyMedia, allowLocalOnly, feedType],
  );

  const handleHeaderClick = useCallback(() => columnRef.current?.scrollTop(), []);

  useEffect(() => {
    let disconnect;

    switch(feedType) {
    case 'community':
      dispatch(expandCommunityTimeline({ onlyMedia }));
      if (signedIn) {
        disconnect = dispatch(connectCommunityStream({ onlyMedia }));
      }
      break;
    case 'public':
      dispatch(expandPublicTimeline({ onlyMedia }));
      if (signedIn) {
        disconnect = dispatch(connectPublicStream({ onlyMedia, allowLocalOnly }));
      }
      break;
    case 'public:remote':
      dispatch(expandPublicTimeline({ onlyMedia, onlyRemote: true }));
      if (signedIn) {
        disconnect = dispatch(connectPublicStream({ onlyMedia, onlyRemote: true }));
      }
      break;
    }

    return () => disconnect?.();
  }, [dispatch, signedIn, feedType, onlyMedia, allowLocalOnly]);

  const prependBanner = feedType === 'community' ? (
    <DismissableBanner id='community_timeline'>
      <FormattedMessage
        id='dismissable_banner.community_timeline'
        defaultMessage='These are the most recent public posts from people whose accounts are hosted by {domain}.'
        values={{ domain }}
      />
    </DismissableBanner>
  ) : (
    <DismissableBanner id='public_timeline'>
      <FormattedMessage
        id='dismissable_banner.public_timeline'
        defaultMessage='These are the most recent public posts from people on the social web that people on {domain} follow.'
        values={{ domain }}
      />
    </DismissableBanner>
  );

  const emptyMessage = feedType === 'community' ? (
    <FormattedMessage
      id='empty_column.community'
      defaultMessage='The local timeline is empty. Write something publicly to get the ball rolling!'
    />
  ) : (
    <FormattedMessage
      id='empty_column.public'
      defaultMessage='There is nothing here! Write something publicly, or manually follow users from other servers to fill it up'
    />
  );

  return (
    <Column bindToDocument={!multiColumn} ref={columnRef} label={intl.formatMessage(messages.title)}>
      <ColumnHeader
        icon='globe'
        active={hasUnread}
        title={intl.formatMessage(messages.title)}
        onPin={handlePin}
        onClick={handleHeaderClick}
        multiColumn={multiColumn}
      >
        <ColumnSettings />
      </ColumnHeader>

      <div className='scrollable scrollable--flex'>
        <div className='account__section-headline'>
          <NavLink exact to='/public/local'>
            <FormattedMessage tagName='div' id='firehose.local' defaultMessage='This server' />
          </NavLink>

          <NavLink exact to='/public/remote'>
            <FormattedMessage tagName='div' id='firehose.remote' defaultMessage='Other servers' />
          </NavLink>

          <NavLink exact to='/public'>
            <FormattedMessage tagName='div' id='firehose.all' defaultMessage='All' />
          </NavLink>
        </div>

        <StatusListContainer
          prepend={prependBanner}
          timelineId={`${feedType}${feedType === 'public' && allowLocalOnly ? ':allow_local_only' : ''}${onlyMedia ? ':media' : ''}`}
          onLoadMore={handleLoadMore}
          trackScroll
          scrollKey='firehose'
          emptyMessage={emptyMessage}
          bindToDocument={!multiColumn}
          regex={regex}
        />
      </div>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
}

Firehose.propTypes = {
  multiColumn: PropTypes.bool,
  feedType: PropTypes.string,
};

export default Firehose;
