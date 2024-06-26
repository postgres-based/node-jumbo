import type { MessageState, ErrorAndNotices } from './types';

import { parse as parseAuthentication } from './Authentication';
import { parse as parseBackendKeyData } from './BackendKeyData';
import { parse as parseErrorResponse } from './ErrorResponse';
import { parse as parseNegotiateProtocolVersion } from './NegotiateProtocolVersion';
import { parse as parseNoticeResponse } from './NoticeResponse';
import { parse as parseNotificationResponse } from './NotificationResponse';
import { parse as parseParameterStatus } from './ParameterStatus';
import { parse as parseR4Q } from './ReadyForQuery';

export const AUTH_CLASS = 82; // 'R' Authentication message
export const PARAM_STATUS = 83; // 'S' connection parameter
export const READY_4_QUERY = 90; // 'Z' ready for query
export const BACKEND_KEY_DATA = 75; // 'K' cancellation key data
export const ERROR = 69; // 'E' Error Response
export const NEGOTIATE_PROTOCOL = 118; // 'v' NegotiateProtocolVersion (B)
export const NO_DATA = 110; // 'n' NoData(B)
export const NOTICE_RESPONSE = 78; // 'N' NoticeResponse
export const PARSE_COMPLETE = 49; // '1' Parse complete
export const PORTAL_SUSPEND = 115; // 's' Portal suspend
export const BIND_COMPLETE = 50; // '2' Bind complete
export const CLOSE_COMPLETE = 51; // '3' Close Complete
export const COMMAND_COMPLETE = 67; // 'C' Close Complete
export const COPY_DATA = 100; // 'd' Close Complete
export const COPY_DONE = 99; // 'c'
export const COPY_IN_RESPONSE = 71; // 'G' Copy In response
export const COPY_OUT_RESPONSE = 72; // 'H' Copy out Response
export const COPY_BOTH_RESPONSE = 87; // 'W' Copy Both Response
export const DATA_ROW = 68; // 'D'
export const EMPTY_QUERY_RESPONSE = 73; // 'I'
export const NOTIFICATION_RESPONSE = 65; // 'A'
export const PARAMETER_DESCRIPTION = 116; // 't'
export const ROW_DESCRIPTION = 83; // 'T'

export const MSG_UNDECIDED: MessageState = 'undec';
export const MSG_IS: MessageState = 'is';
export const MSG_ERROR: MessageState = 'error';

export const noticeAndErrorTemplate: ErrorAndNotices = {
    S: '',
    V: '',
    C: '',
    M: '',
    D: '',
    H: '',
    P: '',
    p: '',
    q: '',
    W: '',
    s: '',
    t: '',
    c: '',
    d: '',
    n: '',
    F: '',
    L: '',
    R: ''
};

export const mapKey2Parser = {
    [AUTH_CLASS]: parseAuthentication,
    [BACKEND_KEY_DATA]: parseBackendKeyData,
    [ERROR]: parseErrorResponse,
    [NEGOTIATE_PROTOCOL]: parseNegotiateProtocolVersion,
    [NOTICE_RESPONSE]: parseNoticeResponse,
    [NOTIFICATION_RESPONSE]: parseNotificationResponse,
    [PARAM_STATUS]: parseParameterStatus,
    [READY_4_QUERY]: parseR4Q
};

/*

todo: finish this template
  const ParameterStatusTemplate = {
    server_version:'',
    server_encoding:'',
    client_encoding: '',
    application_name
  }
server_version,
server_encoding,
client_encoding,
application_name,
default_transaction_read_only,
in_hot_standby,
is_superuser,
session_authorization,
DateStyle,
IntervalStyle,
TimeZone, integer_date-
times, and standard_conforming_strings. (server_encoding, TimeZone, and
integer_datetimes were not reported by releases before 8.0; standard_conform-
ing_strings was not reported by releases before 8.1; IntervalStyle was not reported
by releases before 8.4; application_name was not reported by releases before 9.0; de-
fault_transaction_read_only and in_hot_standby were not reported by releases be-
fore 14.) Note that server_version, server_encoding and integer_datetimes are
pseudo-parameters
*/
