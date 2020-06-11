/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiButton, EuiLoadingSpinner } from '@elastic/eui';
import React, { useCallback, useEffect } from 'react';
import styled from 'styled-components';

import { useDispatch } from 'react-redux';
import { CommentRequest } from '../../../../../case/common/api';
import { usePostComment } from '../../containers/use_post_comment';
import { Case } from '../../containers/types';
import { MarkdownEditorForm } from '../../../common/components/markdown_editor/form';
import { InsertTimelinePopover } from '../../../timelines/components/timeline/insert_timeline_popover';
import { useInsertTimeline } from '../../../timelines/components/timeline/insert_timeline_popover/use_insert_timeline';
import { Form, useForm, UseField } from '../../../shared_imports';

import * as i18n from './translations';
import { schema } from './schema';
import {
  dispatchUpdateTimeline,
  queryTimelineById,
} from '../../../timelines/components/open_timeline/helpers';
import { updateIsLoading as dispatchUpdateIsLoading } from '../../../timelines/store/timeline/actions';
import { useApolloClient } from '../../../common/utils/apollo_context';

const MySpinner = styled(EuiLoadingSpinner)`
  position: absolute;
  top: 50%;
  left: 50%;
`;

const initialCommentValue: CommentRequest = {
  comment: '',
};

interface AddCommentProps {
  caseId: string;
  disabled?: boolean;
  insertQuote: string | null;
  onCommentSaving?: () => void;
  onCommentPosted: (newCase: Case) => void;
  showLoading?: boolean;
}

export const AddComment = React.memo<AddCommentProps>(
  ({ caseId, disabled, insertQuote, showLoading = true, onCommentPosted, onCommentSaving }) => {
    const { isLoading, postComment } = usePostComment(caseId);
    const { form } = useForm<CommentRequest>({
      defaultValue: initialCommentValue,
      options: { stripEmptyFields: false },
      schema,
    });
    const dispatch = useDispatch();
    const apolloClient = useApolloClient();
    const { handleCursorChange, handleOnTimelineChange } = useInsertTimeline<CommentRequest>(
      form,
      'comment'
    );

    useEffect(() => {
      if (insertQuote !== null) {
        const { comment } = form.getFormData();
        form.setFieldValue(
          'comment',
          `${comment}${comment.length > 0 ? '\n\n' : ''}${insertQuote}`
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [insertQuote]);

    const handleTimelineClick = useCallback(
      (timelineId: string) => {
        queryTimelineById({
          apolloClient,
          timelineId,
          updateIsLoading: ({
            id: currentTimelineId,
            isLoading: isLoadingTimeline,
          }: {
            id: string;
            isLoading: boolean;
          }) =>
            dispatch(
              dispatchUpdateIsLoading({ id: currentTimelineId, isLoading: isLoadingTimeline })
            ),
          updateTimeline: dispatchUpdateTimeline(dispatch),
        });
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [apolloClient]
    );

    const onSubmit = useCallback(async () => {
      const { isValid, data } = await form.submit();
      if (isValid) {
        if (onCommentSaving != null) {
          onCommentSaving();
        }
        postComment(data, onCommentPosted);
        form.reset();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form, onCommentPosted, onCommentSaving]);
    return (
      <span id="add-comment-permLink">
        {isLoading && showLoading && <MySpinner data-test-subj="loading-spinner" size="xl" />}
        <Form form={form}>
          <UseField
            path="comment"
            component={MarkdownEditorForm}
            componentProps={{
              idAria: 'caseComment',
              isDisabled: isLoading,
              dataTestSubj: 'add-comment',
              placeholder: i18n.ADD_COMMENT_HELP_TEXT,
              onCursorPositionUpdate: handleCursorChange,
              onClickTimeline: handleTimelineClick,
              bottomRightContent: (
                <EuiButton
                  data-test-subj="submit-comment"
                  iconType="plusInCircle"
                  isDisabled={isLoading || disabled}
                  isLoading={isLoading}
                  onClick={onSubmit}
                  size="s"
                >
                  {i18n.ADD_COMMENT}
                </EuiButton>
              ),
              topRightContent: (
                <InsertTimelinePopover
                  hideUntitled={true}
                  isDisabled={isLoading}
                  onTimelineChange={handleOnTimelineChange}
                />
              ),
            }}
          />
        </Form>
      </span>
    );
  }
);

AddComment.displayName = 'AddComment';
